"""
Osmanische Zierschicht für die Karte („Bosna Vilayeti“).

Erzeugt aus dem Atlasblatt „Bosna Vilayeti“ (Memalik-i Mahruse-i Şahaneye
Mahsus Mükemmel ve Mufassal Atlas, 1907) eine eigene, frei gezeichnete
Zierschicht:
  - die Sancak-Grenzen, nachgezeichnet und auf die heutige Landesgrenze
    zugeschnitten (näherungsweise, ± wenige Kilometer)
  - die Namen der Sancaks in Nesih-Kalligraphie, ausgerichtet nach der Form
    des Gebiets (wie bei Europa Universalis)

Der Scan selbst wird NICHT veröffentlicht – nur das, was hier neu gezeichnet wird.

Schritt 1 (dieses Skript):  python3 scripts/osmanska-karta/erzeuge.py PFAD/ZUM/SCAN.jpg
  -> schreibt scripts/osmanska-karta/zierschicht.svg
Schritt 2:                  python3 scripts/osmanska-karta/rendern.py
  -> rendert die SVG mit Chrome zu public/karte/osmanska-zierschicht.webp

Benötigt: numpy, scipy, scikit-image, Pillow (Schritt 2 zusätzlich: playwright + Chrome)
"""
import json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.segmentation import watershed
from skimage.draw import disk, polygon as poly_raster
from skimage.measure import find_contours, approximate_polygon

HIER = Path(__file__).resolve().parent
PROJEKT = HIER.parent.parent

# --- Sancaks: Name, Saatpunkt im Scan (x, y), Farbton ------------------------------
# Kaschida (ـ) nur dort, wo die Schrift sie geschwungen setzt: vor einem Elif.
# Vor anderen Buchstaben wird sie zum geraden Strich – das wollen wir nicht.
K = '\u0640' * 3
SANCAKS = {
    'bihke':    {'name': 'بهكه سنجاغی', 'kaschida': 'بهكه سنج' + K + 'اغی',      'saat': (200, 330),  'farbe': '#E8C9A8'},
    'banaluka': {'name': 'بنالوقه سنجاغی', 'kaschida': 'بن' + K + 'الوقه سنج' + K + 'اغی',   'saat': (520, 360),  'farbe': '#D9DDB0'},
    'izvornik': {'name': 'ازوورنیق سنجاغی', 'kaschida': 'ازوورنیق سنج' + K + 'اغی',   'saat': (900, 500),  'farbe': '#EFD9A6'},
    'travnik':  {'name': 'تراونیك سنجاغی', 'kaschida': 'تراونیك سنج' + K + 'اغی',    'saat': (420, 600),  'farbe': '#E9C4BE'},
    'bosna':    {'name': 'بوسنه سنجاغی', 'kaschida': 'بوسنه سنج' + K + 'اغی',      'saat': (900, 800),  'farbe': '#CFDDB8'},
    'hersek':   {'name': 'هرسك سنجاغی', 'kaschida': 'هرسك سنج' + K + 'اغی',       'saat': (750, 1050), 'farbe': '#EAD7B0'},
}

# Punkte AUSSERHALB des Vilayets (Österreich-Ungarn, Dalmatien, Serbien, Montenegro, Meer).
# Was davon innerhalb der heutigen Grenze liegt, wird dem nächsten Sancak zugeschlagen.
AUSSEN = [(900, 110), (1150, 230), (100, 700), (1250, 520), (1150, 1280), (300, 1250), (60, 1000)]

# --- Passpunkte: Scan-Pixel -> (Länge, Breite) heute ---------------------------------
PASSPUNKTE = [
    ((650, 958), (17.808, 43.343)),   # Mostar
    ((858, 734), (18.413, 43.856)),   # Sarajevo
    ((475, 285), (17.191, 44.772)),   # Banja Luka
    ((956, 419), (18.676, 44.538)),   # Tuzla
    ((57, 251), (15.870, 44.817)),    # Bihać
]

# --- Ausgabe: Web-Mercator-Ausschnitt um Bosnien und Herzegowina ----------------------
LON0, LON1, LAT0, LAT1 = 15.55, 19.80, 42.45, 45.35
BREITE = 2400


def merc_y(lat):
    return math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


def main(scan_pfad):
    scan = np.asarray(Image.open(scan_pfad).convert('RGB')).astype(int)
    r, g, b = scan[..., 0], scan[..., 1], scan[..., 2]

    # 1) Sancak-Flächen im Scan: Wasserscheide zwischen den roten Grenzlinien
    rot = ((r > 140) & (r - g > 55) & (r - b > 55)).astype(float)
    hoehe = ndi.gaussian_filter(rot, 2.0)
    marker = np.zeros(rot.shape, int)
    for i, s in enumerate(SANCAKS.values()):
        rr, cc = disk((s['saat'][1], s['saat'][0]), 12, shape=marker.shape)
        marker[rr, cc] = i + 1
    for x, y in AUSSEN:
        rr, cc = disk((y, x), 12, shape=marker.shape)
        marker[rr, cc] = len(SANCAKS) + 1
    flaechen = watershed(hoehe, marker)

    # 2) Passung Scan -> Mercator (affin, Restfehler ca. 1 km)
    P = np.array([[x, y, 1] for (x, y), _ in PASSPUNKTE], float)
    G = np.array([[lon, merc_y(lat)] for _, (lon, lat) in PASSPUNKTE])
    A, *_ = np.linalg.lstsq(P, G, rcond=None)          # [px,py,1] @ A = [lon, my]
    M, t = A[:2].T, A[2]                                # G = M @ [px,py] + t
    Minv = np.linalg.inv(M)

    # 3) Ausgaberaster in Mercator
    my0, my1 = merc_y(LAT0), merc_y(LAT1)
    hoehe_px = round(BREITE * (my1 - my0) / (LON1 - LON0))
    xs = LON0 + (np.arange(BREITE) + 0.5) / BREITE * (LON1 - LON0)
    ys = my1 - (np.arange(hoehe_px) + 0.5) / hoehe_px * (my1 - my0)
    LON, MY = np.meshgrid(xs, ys)
    q = np.stack([LON - t[0], MY - t[1]], -1) @ Minv.T
    sx = np.clip(np.round(q[..., 0]).astype(int), 0, scan.shape[1] - 1)
    sy = np.clip(np.round(q[..., 1]).astype(int), 0, scan.shape[0] - 1)
    raster = flaechen[sy, sx]

    def zu_px(lon, lat):
        return ((lon - LON0) / (LON1 - LON0) * BREITE, (my1 - merc_y(lat)) / (my1 - my0) * hoehe_px)

    # 4) Auf die heutige Landesgrenze zuschneiden
    bih = json.load(open(PROJEKT / 'src' / 'data' / 'bih.json'))
    land = np.zeros(raster.shape, bool)
    bih_pfade = []
    for poly in bih['features'][0]['geometry']['coordinates']:
        ring = np.array([zu_px(lon, lat) for lon, lat in poly[0]])
        rr, cc = poly_raster(ring[:, 1], ring[:, 0], shape=land.shape)
        land[rr, cc] = True
        bih_pfade.append('M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in ring) + 'Z')

    # Landesteile, die im Scan außerhalb des Vilayets liegen -> nächster Sancak
    aussen = land & ((raster == len(SANCAKS) + 1) | (raster == 0))
    if aussen.any():
        _, (iy, ix) = ndi.distance_transform_edt(aussen | ~land | (raster > len(SANCAKS)), return_indices=True)
        innen = land & ~aussen
        _, (jy, jx) = ndi.distance_transform_edt(~innen, return_indices=True)
        raster[aussen] = raster[jy[aussen], jx[aussen]]

    # 5) Glätten (Mehrheitsfilter über weichgezeichnete Masken)
    weich = np.stack([ndi.gaussian_filter((raster == i + 1).astype(float), 3) for i in range(len(SANCAKS))])
    raster = np.argmax(weich, 0) + 1
    raster[~land] = 0

    # 6) Flächen als Pfade + Beschriftung nach Form
    teile, kandidaten = [], {}
    for i, (schluessel, s) in enumerate(SANCAKS.items()):
        maske = raster == i + 1
        if maske.sum() < 500:
            continue
        pfade = []
        for kontur in find_contours(np.pad(maske, 1).astype(float), 0.5):
            kontur = approximate_polygon(kontur - 1, tolerance=1.2)
            if len(kontur) < 4:
                continue
            pfade.append('M' + ' L'.join(f'{x:.1f} {y:.1f}' for y, x in kontur) + 'Z')
        teile.append((schluessel, s, ' '.join(pfade)))
        # Beschriftung nur am größten zusammenhängenden Teil ausrichten
        teile_lab, n = ndi.label(maske)
        groesster = teile_lab == (np.argmax(np.bincount(teile_lab.ravel())[1:]) + 1)
        kandidaten[schluessel] = (s, kandidaten_fuer(groesster, s))

    beschriftungen = einheitlich(kandidaten)
    for k, text, g, w, *_ in beschriftungen:
        print(f'{k}: {text} · {g:.0f} px · {w:.0f}°')
    schreibe_svg(teile, beschriftungen, bih_pfade, BREITE, hoehe_px)
    meta = {'coordinates': [[LON0, LAT1], [LON1, LAT1], [LON1, LAT0], [LON0, LAT0]],
            'breite': BREITE, 'hoehe': hoehe_px}
    (HIER / 'zierschicht.json').write_text(json.dumps(meta, indent=2))
    print('geschrieben:', HIER / 'zierschicht.svg', f'({BREITE}×{hoehe_px})')


SCHRIFT = HIER / 'schrift' / 'Amiri-Bold.ttf'
BOX = 1.12          # Höhe der Schriftbox im Verhältnis zur Schriftgröße


def textbreite(text):
    """Breite pro Schriftgrad (Amiri Bold, echte arabische Satztechnik über Raqm)."""
    from PIL import ImageFont
    f = ImageFont.truetype(str(SCHRIFT), 100, layout_engine=ImageFont.Layout.RAQM)
    return f.getlength(text, direction='rtl') / 100


def groesstes_band(maske, verhaeltnis):
    """Größte Höhe h, für die ein waagrechtes Rechteck h × (verhaeltnis·h) in die Maske passt
    (binäre Suche). Gibt (h, mitte_y, mitte_x) zurück."""
    H, W = maske.shape
    lauf = np.zeros((H, W), np.int32)              # senkrechte Läufe, die in jeder Zeile enden
    lauf[0] = maske[0]
    for y in range(1, H):
        lauf[y] = np.where(maske[y], lauf[y - 1] + 1, 0)

    def passt(h):
        ok = lauf >= h
        r = np.zeros(H, np.int32)
        best_len, best = 0, None
        for x in range(W):                         # waagrechte Läufe, zeilenweise vektorisiert
            r = (r + 1) * ok[:, x]
            y = int(np.argmax(r))
            if r[y] > best_len:
                best_len, best = int(r[y]), (y, x)
        if best_len >= verhaeltnis * h:
            y, x = best
            return (y - h / 2 + 0.5, x - best_len / 2 + 0.5)
        return None

    lo, hi, ergebnis = 4, int(lauf.max()), (0, 0, 0)
    while lo <= hi:
        mid = (lo + hi) // 2
        pos = passt(mid)
        if pos:
            ergebnis = (mid, *pos); lo = mid + 1
        else:
            hi = mid - 1
    return ergebnis


def kandidaten_fuer(maske, s):
    """Alle möglichen geraden Platzierungen: (größe, text, winkel, x, y) je Textvariante und Winkel."""
    klein = 4                                            # Suche auf verkleinertem Raster
    m = maske[::klein, ::klein]
    m_innen = ndi.binary_erosion(m, iterations=2)          # Abstand zu den Grenzlinien
    yy, xx = np.nonzero(m)
    pts = np.stack([xx, yy], 1).astype(float)
    werte, vek = np.linalg.eigh(np.cov((pts - pts.mean(0)).T))
    grund = math.degrees(math.atan2(vek[1, 1], vek[0, 1]))
    kandidaten = []
    for text in [s['name'], s.get('kaschida')]:
        if not text:
            continue
        verhaeltnis = textbreite(text) / BOX
        for winkel in np.arange(grund - 60, grund + 61, 3):
            w = ((winkel + 90) % 180) - 90               # nie kopfüber
            gedreht = ndi.rotate(m_innen, w, reshape=True, order=0)
            h, cy, cx = groesstes_band(gedreht, verhaeltnis * 1.08)
            if h == 0:
                continue
            Hr, Wr = gedreht.shape
            H0, W0 = m.shape
            a = math.radians(w)
            dx, dy = cx - Wr / 2, cy - Hr / 2
            ox = math.cos(a) * dx - math.sin(a) * dy + W0 / 2
            oy = math.sin(a) * dx + math.cos(a) * dy + H0 / 2
            groesse = h * klein / BOX * 0.9
            kandidaten.append((groesse, text, w, ox * klein, oy * klein))
    return kandidaten


def einheitlich(alle):
    """Alle Namen gleich groß: die kleinste mögliche Größe ist die Obergrenze.
    Wo dann Platz übrig ist, kommt die Kaschida-Variante zum Zug."""
    groesse = min(max(k[0] for k in kand if k[1] == s['name']) for s, kand in alle.values())
    ergebnis = []
    for schluessel, (s, kand) in alle.items():
        passend = [k for k in kand if k[0] >= groesse]
        mit = [k for k in passend if k[1] != s['name']]
        wahl_aus = mit or [k for k in passend if k[1] == s['name']]
        # bei gleicher Größe: die Lage mit dem meisten Spielraum
        _, text, w, x, y = max(wahl_aus, key=lambda k: k[0] - 0.02 * abs(k[2]))
        ergebnis.append((schluessel, text, groesse, w, x, y))
    return ergebnis


def schreibe_svg(teile, beschriftungen, bih_pfade, w, h):
    rot, tinte = '#A8473A', '#2A1A12'
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
           '<defs>',
           '<clipPath id="land">' + ''.join(f'<path d="{p}"/>' for p in bih_pfade) + '</clipPath>',
           # Flächen laufen an den Sancak-Grenzen weich ineinander
           '<filter id="verlauf" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="26"/></filter>']
    # Tintenwirkung: leicht unruhige Ränder wie mit dem Kalem geschrieben
    out.append('<filter id="kalem" x="-5%" y="-30%" width="110%" height="160%">'
               '<feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="5" result="r"/>'
               '<feDisplacementMap in="SourceGraphic" in2="r" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"/>'
               '<feGaussianBlur in="d" stdDeviation="0.5" result="b"/>'
               '<feComponentTransfer in="b"><feFuncA type="linear" slope="1.25" intercept="-0.05"/></feComponentTransfer>'
               '</filter>')
    out.append('</defs>')
    # zarte Flächenfarben wie im Atlas, ohne Grenzlinien, ineinander verlaufend
    out.append('<g clip-path="url(#land)" opacity="0.55">')
    out.append(''.join(f'<path d="{p}" fill="#E6D4B0"/>' for p in bih_pfade))
    out.append('<g filter="url(#verlauf)">')
    for k, s, d in teile:
        out.append(f'<path d="{d}" fill="{s["farbe"]}" fill-rule="evenodd"/>')
    out.append('</g></g>')
    # Kalligraphie (Nesih), gerade gesetzt
    out.append(f'<g fill="{tinte}" fill-opacity="0.5" filter="url(#kalem)">')
    for k, text, groesse, winkel, x, y in beschriftungen:
        out.append(
            f'<text class="sancak" x="{x:.1f}" y="{y:.1f}" transform="rotate({winkel:.1f} {x:.1f} {y:.1f})" '
            f'font-family="Amiri" font-weight="700" font-size="{groesse:.0f}" direction="rtl" '
            f'text-anchor="middle" dominant-baseline="central">{text}</text>')
    out.append('</g>')
    out.append('</svg>')
    (HIER / 'zierschicht.svg').write_text('\n'.join(out), encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('Aufruf: python3 scripts/osmanska-karta/erzeuge.py PFAD/ZUM/SCAN.jpg')
    main(sys.argv[1])
