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

# --- Sancaks: Name (bitte prüfen!), Saatpunkt im Scan (x, y), Farbton ------------
SANCAKS = {
    'bihke':    {'name': 'بهكه سنجاغی',      'saat': (200, 330),  'farbe': '#E8C9A8'},
    'banaluka': {'name': 'بنالوقه سنجاغی',   'saat': (520, 360),  'farbe': '#D9DDB0'},
    'izvornik': {'name': 'ازوورنیق سنجاغی',   'saat': (900, 500),  'farbe': '#EFD9A6'},
    'travnik':  {'name': 'تراونیك سنجاغی',    'saat': (420, 600),  'farbe': '#E9C4BE'},
    'bosna':    {'name': 'بوسنه سنجاغی',      'saat': (900, 800),  'farbe': '#CFDDB8'},
    'hersek':   {'name': 'هرسك سنجاغی',       'saat': (750, 1050), 'farbe': '#EAD7B0'},
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
    teile, beschriftungen = [], []
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
        beschriftungen.append((schluessel, s['name'], *beschriftungs_bogen(groesster)))

    schreibe_svg(teile, beschriftungen, bih_pfade, BREITE, hoehe_px)
    meta = {'coordinates': [[LON0, LAT1], [LON1, LAT1], [LON1, LAT0], [LON0, LAT0]],
            'breite': BREITE, 'hoehe': hoehe_px}
    (HIER / 'zierschicht.json').write_text(json.dumps(meta, indent=2))
    print('geschrieben:', HIER / 'zierschicht.svg', f'({BREITE}×{hoehe_px})')


def beschriftungs_bogen(maske):
    """Bogen entlang der Hauptachse des Gebiets (wie bei Europa Universalis)."""
    yy, xx = np.nonzero(maske)
    pts = np.stack([xx, yy], 1).astype(float)
    mitte = pts.mean(0)
    cov = np.cov((pts - mitte).T)
    werte, vek = np.linalg.eigh(cov)
    achse = vek[:, 1]
    if achse[0] < 0:
        achse = -achse                     # Schrift nie kopfüber
    quer = np.array([-achse[1], achse[0]])
    u = (pts - mitte) @ achse
    v = (pts - mitte) @ quer
    # Querschnitte entlang der Achse
    bins = np.linspace(u.min(), u.max(), 40)
    mitten, dicken, us = [], [], []
    for a, b in zip(bins[:-1], bins[1:]):
        sel = (u >= a) & (u < b)
        if sel.sum() < 20:
            continue
        lo, hi = np.percentile(v[sel], [5, 95])
        us.append((a + b) / 2); mitten.append((lo + hi) / 2); dicken.append(hi - lo)
    us, mitten, dicken = map(np.array, (us, mitten, dicken))
    gut = dicken > 0.45 * dicken.max()
    u_a, u_b = us[gut].min(), us[gut].max()
    rand = 0.10 * (u_b - u_a)
    u_a, u_b = u_a + rand, u_b - rand
    # sanfter Bogen: Parabel durch die Querschnittsmitten, Krümmung begrenzt
    koeff = np.polyfit(us[gut], mitten[gut], 2, w=dicken[gut])
    koeff[0] = np.clip(koeff[0], -0.0012, 0.0012)
    tt = np.linspace(u_a, u_b, 24)
    vv = np.polyval(koeff, tt)
    punkte = mitte + np.outer(tt, achse) + np.outer(vv, quer)
    laenge = float(np.sum(np.hypot(*np.diff(punkte, axis=0).T)))
    dicke = float(np.median(dicken[gut]))
    pfad = 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in punkte)
    return pfad, laenge, dicke


def schreibe_svg(teile, beschriftungen, bih_pfade, w, h):
    rot, tinte = '#B23A2B', '#2A1A12'
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
           '<defs>',
           # Maske: Außengrenze ausblenden (die goldene Landesgrenze kommt aus der Grundkarte)
           f'<mask id="innen"><rect width="{w}" height="{h}" fill="white"/>'
           + ''.join(f'<path d="{p}" fill="none" stroke="black" stroke-width="18" stroke-linejoin="round"/>' for p in bih_pfade)
           + '</mask>']
    for k, _, pfad, *_ in beschriftungen:
        out.append(f'<path id="bogen-{k}" d="{pfad}"/>')
    out.append('</defs>')
    # zarte Flächenfarben wie im Atlas
    for k, s, d in teile:
        out.append(f'<path d="{d}" fill="{s["farbe"]}" fill-opacity="0.55" fill-rule="evenodd"/>')
    # rote Sancak-Grenzen: heller Saum + rote Linie
    out.append('<g mask="url(#innen)" fill="none" stroke-linejoin="round">')
    for k, s, d in teile:
        out.append(f'<path d="{d}" stroke="#F6E9CF" stroke-width="7" stroke-opacity="0.8"/>')
    for k, s, d in teile:
        out.append(f'<path d="{d}" stroke="{rot}" stroke-width="3.2"/>')
    out.append('</g>')
    # Kalligraphie: Größe und Kaschida-Dehnung passt rendern.py im Browser an
    for k, name, pfad, laenge, dicke in beschriftungen:
        groesse = max(34, min(0.5 * dicke, 130))
        out.append(
            f'<text class="sancak" data-ziel="{laenge*0.82:.0f}" data-max="{groesse:.0f}" '
            f'font-family="Amiri" font-weight="700" font-size="{groesse:.0f}" fill="{tinte}" '
            f'fill-opacity="0.82" direction="rtl" text-anchor="middle" '
            f'paint-order="stroke" stroke="#F6E9CF" stroke-width="{groesse*0.08:.1f}" stroke-opacity="0.6">'
            f'<textPath href="#bogen-{k}" startOffset="50%">{name}</textPath></text>')
    out.append('</svg>')
    (HIER / 'zierschicht.svg').write_text('\n'.join(out), encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit('Aufruf: python3 scripts/osmanska-karta/erzeuge.py PFAD/ZUM/SCAN.jpg')
    main(sys.argv[1])
