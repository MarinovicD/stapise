"""
Erzeugt die Ebru-Texturen (Marmorpapier) der Seite.

Die Texturen werden mathematisch erzeugt (Marmorier-Algorithmus mit Farbtropfen),
damit keine fremden Bildrechte im Spiel sind. Sie werden als Streifen
für Kopf, Fuß und Ränder verwendet.

Aufruf:  python3 scripts/ebru.py
Benötigt: numpy, Pillow
"""
import numpy as np
from PIL import Image
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public" / "textures"
W, H = 2400, 480

VARIANTEN = {
    # Name: (Zellfarben, Aderfarbe, Seed)
    "ebru-lapis": (["#E9DFC8", "#DCCBA4", "#A9C9C3", "#C8A866", "#E6D8B6", "#8DB7B1", "#EFE6D2"], "#24304F", 7),
    "ebru-sepia": (["#C9A57C", "#B98F63", "#D6B98F", "#A8825A", "#C29B70", "#DDC39C"], "#2A1A12", 11),
}


def hex2rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def periodisches_rauschen(rng, x, y, terme=6):
    """Summe periodischer Sinuswellen -> nahtlos kachelbar."""
    v = np.zeros_like(x)
    for _ in range(terme):
        kx, ky = rng.integers(1, 5), rng.integers(-3, 4)
        ph = rng.uniform(0, 2 * np.pi)
        amp = rng.uniform(0.4, 1.0) / (abs(kx) + abs(ky))
        v += amp * np.sin(2 * np.pi * (kx * x + ky * y) + ph)
    return v


def erzeuge(name, farben, ader, seed):
    """Klassischer Marmorier-Algorithmus: Farbtropfen werden nacheinander
    "aufs Wasser" gesetzt und schieben die vorhandenen Tropfen beiseite
    (p' = c + (p - c) * sqrt(1 + r^2 / |p - c|^2)). Gerechnet wird rückwärts
    pro Pixel. Die Textur ist breit genug für große Bildschirme
    (CSS: background-size: cover)."""
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float64)

    # leichte Wellenbewegung (wie mit dem Kamm gezogen), periodisch
    u, v = xs / W, ys / H
    px = xs + 10 * periodisches_rauschen(rng, u, v, 5)
    py = ys + 16 * periodisches_rauschen(rng, u, v, 5)

    n = 520
    cx = rng.uniform(0, W, n)
    cy = rng.uniform(0, H, n)
    r = rng.uniform(16, 46, n)
    pal = np.stack([hex2rgb(f) for f in farben])
    tropfenfarbe = pal[rng.integers(0, len(pal), n)]
    tropfenfarbe = tropfenfarbe * rng.uniform(0.95, 1.05, (n, 1))

    farbe = np.zeros((H, W, 3), dtype=np.float64)
    fertig = np.zeros((H, W), dtype=bool)
    ader_rgb = hex2rgb(ader).astype(np.float64)
    papier = hex2rgb(farben[0]).astype(np.float64)

    for i in range(n - 1, -1, -1):
        dx = px - cx[i]
        dy = py - cy[i]
        d2 = dx * dx + dy * dy
        drin = (d2 <= r[i] ** 2) & ~fertig
        if drin.any():
            dist = np.sqrt(d2[drin])
            # dünne dunkle Ader am Tropfenrand, innen leicht hellerer Kern
            t = np.clip((r[i] - dist) / 1.6, 0, 1)
            kern = 1 + 0.05 * (1 - dist / r[i])
            c = tropfenfarbe[i][None, :] * kern[:, None]
            farbe[drin] = c * t[:, None] + ader_rgb[None, :] * (1 - t[:, None])
            fertig |= drin
        aussen = ~fertig
        f = np.sqrt(np.maximum(1 - r[i] ** 2 / np.maximum(d2[aussen], 1e-9), 0))
        px[aussen] = cx[i] + dx[aussen] * f
        py[aussen] = cy[i] + dy[aussen] * f

    farbe[~fertig] = papier
    korn = rng.normal(0, 2.2, (H, W))[..., None]
    img = np.clip(farbe + korn, 0, 255).astype(np.uint8)

    OUT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(img).save(OUT / f"{name}.webp", "WEBP", quality=82, method=6)
    print("geschrieben:", OUT / f"{name}.webp")


if __name__ == "__main__":
    for name, (farben, ader, seed) in VARIANTEN.items():
        erzeuge(name, farben, ader, seed)
