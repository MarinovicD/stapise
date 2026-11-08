"""
Rendert zierschicht.svg mit Chrome (richtige arabische Schriftsetzung)
zu public/karte/osmanska-zierschicht.webp mit transparentem Hintergrund.

Aufruf: python3 scripts/osmanska-karta/rendern.py
"""
import asyncio, json, io
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright

HIER = Path(__file__).resolve().parent
PROJEKT = HIER.parent.parent
SCHRIFT = PROJEKT / 'node_modules/@fontsource/amiri/files/amiri-arabic-700-normal.woff2'
ZIEL = PROJEKT / 'public/karte/osmanska-zierschicht.webp'


# Passt jede Beschriftung an ihr Gebiet an: erst die Schriftgröße, dann – wie
# in der osmanischen Kartografie – Dehnung mit Kaschida (ـ) statt Sperrsatz.
ANPASSEN = r"""
() => {
  const TATWEEL = '\u0640';
  // nach diesen Buchstaben darf gedehnt werden (verbinden nach links)
  const verbindend = 'بتثجحخسشصضطظعغفقكکلمنهیيئگپچ';
  const bericht = [];
  for (const t of document.querySelectorAll('text.sancak')) {
    const tp = t.querySelector('textPath');
    const ziel = +t.dataset.ziel, max = +t.dataset.max;
    let text = tp.textContent;
    let groesse = max;
    t.setAttribute('font-size', groesse);
    let l = tp.getComputedTextLength();
    if (l > ziel) { groesse = Math.max(28, groesse * ziel / l); t.setAttribute('font-size', groesse); }
    // Kaschida-Stellen: im Wortinneren nach verbindenden Buchstaben
    const stellen = [];
    for (let i = 0; i < text.length - 1; i++) {
      if (verbindend.includes(text[i]) && text[i + 1] !== ' ' && text[i + 1] !== TATWEEL) stellen.push(i);
    }
    // bevorzugt: nach dem س von سنجاغی und mittig im Namen
    stellen.sort((a, b) => (text[b] === 'س') - (text[a] === 'س'));
    let n = 0;
    while (tp.getComputedTextLength() < ziel * 0.9 && n < 14 && stellen.length) {
      const pos = stellen[n % Math.min(stellen.length, 3)];
      const versatz = text.slice(0, pos + 1).length;
      text = text.slice(0, pos + 1) + TATWEEL + text.slice(pos + 1);
      for (let j = 0; j < stellen.length; j++) if (stellen[j] > pos) stellen[j]++;
      tp.textContent = text; n++;
    }
    bericht.push(`${text}: ${Math.round(groesse)}px, ${n} Kaschida`);
  }
  return bericht.join('\n');
}
"""


async def main():
    meta = json.loads((HIER / 'zierschicht.json').read_text())
    w, h = meta['breite'], meta['hoehe']
    svg = (HIER / 'zierschicht.svg').read_text(encoding='utf-8')
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
      @font-face {{ font-family: 'Amiri'; font-weight: 700; src: url('{SCHRIFT.as_uri()}') format('woff2'); }}
      html, body {{ margin: 0; background: transparent; }}
    </style></head><body>{svg}</body></html>"""
    seite = HIER / '_render.html'
    seite.write_text(html, encoding='utf-8')
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        pg = await b.new_page(viewport={'width': w, 'height': h})
        await pg.goto(seite.as_uri())
        await pg.evaluate('document.fonts.ready')
        await pg.wait_for_timeout(300)
        bericht = await pg.evaluate(ANPASSEN)
        print(bericht)
        await pg.wait_for_timeout(300)
        png = await pg.screenshot(omit_background=True, full_page=False)
        await b.close()
    seite.unlink()
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    Image.open(io.BytesIO(png)).save(ZIEL, 'WEBP', quality=88, method=6)
    print('geschrieben:', ZIEL, f'{ZIEL.stat().st_size // 1024} KB')

asyncio.run(main())
