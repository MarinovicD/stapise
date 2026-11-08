/**
 * Bereitet Fotos für die Webseite vor.
 *
 *   npm run fotos
 *
 * Nimmt alle Bilder aus fotos-original/ und legt nach public/fotos/ ab:
 *   - längste Seite höchstens 2000 px
 *   - WebP-Format (klein, aber scharf)
 *   - OHNE Metadaten: GPS-Position, Kameramodell, Aufnahmedatum werden entfernt
 *   - richtig gedreht (Ausrichtung aus dem Handy wird übernommen)
 *
 * Bereits umgewandelte Fotos werden übersprungen, außer das Original ist neuer.
 */
import sharp from 'sharp';
import { readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';

const EIN = 'fotos-original';
const AUS = path.join('public', 'fotos');
const MAX = 2000;
const QUALITAET = 82;
const ENDUNGEN = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic', '.heif', '.avif']);

/** "Mostar Džamija 1.JPG" -> "mostar-dzamija-1" */
function sauberName(datei) {
  return path.parse(datei).name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'dj')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

await mkdir(AUS, { recursive: true });
const dateien = (await readdir(EIN)).filter((d) => ENDUNGEN.has(path.extname(d).toLowerCase()));

if (dateien.length === 0) {
  console.log(`Keine Fotos in ${EIN}/ gefunden.`);
  process.exit(0);
}

let neu = 0;
for (const datei of dateien) {
  const quelle = path.join(EIN, datei);
  const ziel = path.join(AUS, `${sauberName(datei)}.webp`);
  try {
    const [q, z] = await Promise.all([stat(quelle), stat(ziel).catch(() => null)]);
    if (z && z.mtimeMs >= q.mtimeMs) continue;
    await sharp(quelle)
      .rotate() // Ausrichtung übernehmen, danach werden alle Metadaten verworfen
      .resize({ width: MAX, height: MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITAET })
      .toFile(ziel);
    const kb = Math.round((await stat(ziel)).size / 1024);
    console.log(`✓ ${datei} → ${path.basename(ziel)} (${kb} KB)`);
    neu++;
  } catch (fehler) {
    console.error(`✗ ${datei}: ${fehler.message}`);
  }
}
console.log(neu ? `\n${neu} Foto(s) umgewandelt. Dateinamen in der Inschrift unter "fotos" eintragen.` : 'Alles aktuell.');
