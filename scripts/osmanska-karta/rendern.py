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
SCHRIFT = HIER / 'schrift' / 'Amiri-Bold.ttf'
ZIEL = PROJEKT / 'public/karte/osmanska-zierschicht.webp'


async def main():
    meta = json.loads((HIER / 'zierschicht.json').read_text())
    w, h = meta['breite'], meta['hoehe']
    svg = (HIER / 'zierschicht.svg').read_text(encoding='utf-8')
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
      @font-face {{ font-family: 'Amiri'; font-weight: 700; src: url('{SCHRIFT.as_uri()}') format('truetype'); }}
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

        png = await pg.screenshot(omit_background=True, full_page=False)
        await b.close()
    seite.unlink()
    ZIEL.parent.mkdir(parents=True, exist_ok=True)
    Image.open(io.BytesIO(png)).save(ZIEL, 'WEBP', quality=88, method=6)
    print('geschrieben:', ZIEL, f'{ZIEL.stat().st_size // 1024} KB')

asyncio.run(main())
