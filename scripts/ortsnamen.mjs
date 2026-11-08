/**
 * Holt die Ortsnamen Bosniens und Herzegowinas aus den OpenStreetMap-Kartendaten
 * (OpenFreeMap) und speichert sie für die Arebica-Beschriftung der Karte.
 *
 *   node scripts/ortsnamen.mjs
 *   -> public/data/mjesta.json (Lateinschrift; umgewandelt wird erst im Browser,
 *                              damit Änderungen an der Arebica-Tabelle sofort wirken)
 *
 * Daten © OpenStreetMap-Mitwirkende (ODbL).
 */
import { VectorTile } from '@mapbox/vector-tile';
import * as P from 'pbf';
const Pbf = P.default || P.PbfReader || P.Pbf;
import { readFile, writeFile } from 'node:fs/promises';
import zlib from 'node:zlib';

const ZOOM = 11;
const BBOX = [15.65, 42.5, 19.7, 45.3]; // W, S, O, N
const KLASSEN = { city: 1, town: 2, village: 3 };

const bih = JSON.parse(await readFile(new URL('../src/data/bih.json', import.meta.url)));
const ringe = bih.features[0].geometry.coordinates.map((p) => p[0]);

function inBiH([x, y]) {
  let drin = false;
  for (const r of ringe) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) drin = !drin;
    }
  }
  return drin;
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);

const tilejson = await (await fetch('https://tiles.openfreemap.org/planet')).json();
const vorlage = tilejson.tiles[0];

const kacheln = [];
for (let x = lon2x(BBOX[0], ZOOM); x <= lon2x(BBOX[2], ZOOM); x++)
  for (let y = lat2y(BBOX[3], ZOOM); y <= lat2y(BBOX[1], ZOOM); y++) kacheln.push([x, y]);
console.log(`${kacheln.length} Kacheln auf Zoomstufe ${ZOOM} …`);

const orte = new Map();
let fertig = 0;
async function lade([x, y]) {
  const url = vorlage.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y);
  const res = await fetch(url);
  if (!res.ok) return;
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x1f) buf = zlib.gunzipSync(buf);
  const kachel = new VectorTile(new Pbf(buf));
  const ebene = kachel.layers.place;
  if (!ebene) return;
  for (let i = 0; i < ebene.length; i++) {
    const f = ebene.feature(i);
    const p = f.properties;
    if (!KLASSEN[p.class]) continue;
    const name = p['name:latin'] || p['name:bs'] || p['name:hr'] || p['name:sr-Latn'] || p.name;
    if (!name || /[Ѐ-ӿ]/.test(name)) continue; // nur Lateinschrift
    const [lon, lat] = f.toGeoJSON(x, y, ZOOM).geometry.coordinates;
    if (!inBiH([lon, lat])) continue;
    const schluessel = `${name}|${lon.toFixed(2)}|${lat.toFixed(2)}`;
    if (!orte.has(schluessel)) orte.set(schluessel, { n: name, k: KLASSEN[p.class], r: p.rank ?? 99, c: [+lon.toFixed(5), +lat.toFixed(5)] });
  }
}

// mehrere Kacheln gleichzeitig, aber schonend
const warteschlange = [...kacheln];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (warteschlange.length) {
    await lade(warteschlange.shift());
    if (++fertig % 50 === 0) console.log(`  ${fertig}/${kacheln.length}`);
  }
}));

const liste = [...orte.values()].sort((a, b) => a.k - b.k || a.r - b.r);
// kompaktes Format: [Länge, Breite, Klasse (1 Stadt · 2 Kleinstadt · 3 Dorf), Name]
const daten = {
  quelle: '© OpenStreetMap-Mitwirkende (ODbL), über OpenFreeMap',
  orte: liste.map((o) => [o.c[0], o.c[1], o.k, o.n]),
};
await writeFile(new URL('../public/data/mjesta.json', import.meta.url), JSON.stringify(daten));
console.log(`${liste.length} Orte gespeichert (Städte: ${liste.filter((o) => o.k === 1).length}, Kleinstädte: ${liste.filter((o) => o.k === 2).length}, Dörfer: ${liste.filter((o) => o.k === 3).length}).`);
