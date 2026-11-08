/**
 * Holt die Orts- und Gewässernamen Bosniens und Herzegowinas aus den
 * OpenStreetMap-Kartendaten (OpenFreeMap) für die eigene Beschriftung der Karte.
 *
 *   node scripts/ortsnamen.mjs
 *   -> public/data/vode.json   (Flüsse und Seen)
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
const fluesse = new Map();   // Name -> Liste von Linien
const seen = new Map();

/** Douglas-Peucker-Vereinfachung */
function vereinfache(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const d = Math.abs((b[1] - a[1]) * x - (b[0] - a[0]) * y + b[0] * a[1] - b[1] * a[0]) / (Math.hypot(b[1] - a[1], b[0] - a[0]) || 1e-12);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [a, b];
  return [...vereinfache(pts.slice(0, idx + 1), tol).slice(0, -1), ...vereinfache(pts.slice(idx), tol)];
}
const latname = (p) => p['name:latin'] || p['name:bs'] || p['name:hr'] || p['name:sr-Latn'] || p.name;
let fertig = 0;
async function lade([x, y]) {
  const url = vorlage.replace('{z}', ZOOM).replace('{x}', x).replace('{y}', y);
  const res = await fetch(url);
  if (!res.ok) return;
  let buf = Buffer.from(await res.arrayBuffer());
  if (buf[0] === 0x1f) buf = zlib.gunzipSync(buf);
  const kachel = new VectorTile(new Pbf(buf));
  const fluss = kachel.layers.waterway;
  for (let i = 0; fluss && i < fluss.length; i++) {
    const f = fluss.feature(i);
    const name = latname(f.properties);
    if (f.properties.class !== 'river' || !name || /[\u0400-\u04FF]/.test(name)) continue;
    const g = f.toGeoJSON(x, y, ZOOM).geometry;
    const linien = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
    for (const l of linien) {
      // nur die Abschnitte innerhalb Bosniens behalten
      let lauf = [];
      const abschnitte = [];
      for (const pt of l) {
        if (inBiH(pt)) lauf.push(pt);
        else { if (lauf.length > 1) abschnitte.push(lauf); lauf = []; }
      }
      if (lauf.length > 1) abschnitte.push(lauf);
      for (const a of abschnitte) {
        const v = vereinfache(a, 0.0008).map(([p, q]) => [+p.toFixed(4), +q.toFixed(4)]);
        if (!fluesse.has(name)) fluesse.set(name, []);
        fluesse.get(name).push(v);
      }
    }
  }
  const wasser = kachel.layers.water_name;
  for (let i = 0; wasser && i < wasser.length; i++) {
    const f = wasser.feature(i);
    const name = latname(f.properties);
    if (!['lake', 'reservoir', 'water'].includes(f.properties.class) && f.properties.class !== undefined) continue;
    if (!name || /[\u0400-\u04FF]/.test(name)) continue;
    const g = f.toGeoJSON(x, y, ZOOM).geometry;
    const linie = g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' ? g.coordinates[0] : null;
    const punkt = g.type === 'Point' ? g.coordinates : linie ? linie[Math.floor(linie.length / 2)] : null;
    if (!punkt || !inBiH(punkt)) continue;
    if (!seen.has(name)) seen.set(name, punkt.map((c) => +c.toFixed(5)));
  }

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
const vode = {
  quelle: '© OpenStreetMap-Mitwirkende (ODbL), über OpenFreeMap',
  rijeke: [...fluesse].map(([name, linien]) => ({ name, linien })),
  jezera: [...seen].map(([name, c]) => [c[0], c[1], name]),
};
await writeFile(new URL('../public/data/vode.json', import.meta.url), JSON.stringify(vode));
console.log(`${vode.rijeke.length} Flüsse, ${vode.jezera.length} Seen gespeichert.`);
console.log(`${liste.length} Orte gespeichert (Städte: ${liste.filter((o) => o.k === 1).length}, Kleinstädte: ${liste.filter((o) => o.k === 2).length}, Dörfer: ${liste.filter((o) => o.k === 3).length}).`);
