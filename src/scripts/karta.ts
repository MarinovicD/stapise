/**
 * Interaktive Karte – das Herzstück der Seite.
 *
 * - Grundkarte: OpenFreeMap (OpenStreetMap-Daten, kostenlos, ohne API-Schlüssel),
 *   umgefärbt in die Farben der Stilrichtung. Fällt der Dienst aus, bleibt eine
 *   schlichte Karte aus eigenen Daten (Landesgrenze) stehen.
 * - Markierungen: eigene HTML-Elemente (Spitzbogen = einzelne Inschrift,
 *   Şemse-Medaillon = Gruppe), damit sie exakt wie das Design aussehen.
 */
import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Der Web-Worker von MapLibre muss für den Build eigens gebündelt werden
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import bih from '../data/bih.json';
import { GRUPPEN, ART_LABEL, SPRACHE_LABEL, type Gruppe, type Art, type Sprache } from '../lib/konstanten';

const STIL_URL = 'https://tiles.openfreemap.org/styles/positron';

const F = {
  krec: '#F3ECDD', ahar: '#E6D6B4', papierHell: '#FBF7EE', orah: '#3A2519',
  varak: '#B08A3E', cilim: '#9B2C2A', lapis: '#1F2E66', kamen: '#B7AA94',
  wasserFlaeche: '#C9DFDA', wasserLinie: '#86B9B5', wasserText: '#22696B',
  land: '#EAE1CB', gebaeude: '#E2D6BE', strasse: '#FBF7EE', strasseRand: '#D9CBAE',
};

interface Eigenschaften {
  id: string; titel: string; art: Art; gruppe: Gruppe; stadt: string; sprachen: Sprache[];
  jahr: number | null; datum: string; ersteZeile: string; zeilen: number; schrift: string;
  foto: string | null; fotoAlt: string; link: string; beispiel: boolean;
}
type Punkt = GeoJSON.Feature<GeoJSON.Point, Eigenschaften>;

/* ---------- Grundkarte umfärben ---------- */

function umfaerben(stil: StyleSpecification): StyleSpecification {
  for (const layer of stil.layers) {
    const l = layer as any;
    const sl: string = l['source-layer'] ?? '';
    l.paint = l.paint ?? {};
    try {
      if (l.type === 'background') l.paint['background-color'] = F.krec;
      else if (l.type === 'fill') {
        if (sl === 'water') l.paint['fill-color'] = F.wasserFlaeche;
        else if (sl === 'building') l.paint['fill-color'] = F.gebaeude;
        else if (['landcover', 'landuse', 'park', 'aeroway'].includes(sl)) l.paint['fill-color'] = F.land;
      } else if (l.type === 'line') {
        if (sl === 'waterway' || sl === 'water') l.paint['line-color'] = F.wasserLinie;
        else if (sl === 'transportation') l.paint['line-color'] = l.id.includes('casing') ? F.strasseRand : F.strasse;
        else if (sl === 'boundary') l.paint['line-color'] = F.kamen;
      } else if (l.type === 'symbol' && l.layout?.['text-field']) {
        // Ortsnamen in lokaler Schreibweise statt Englisch/Kyrillisch
        if (['place', 'water_name', 'mountain_peak'].includes(sl)) {
          l.layout['text-field'] = ['coalesce', ['get', 'name:bs'], ['get', 'name:hr'], ['get', 'name:sr-Latn'], ['get', 'name:latin'], ['get', 'name']];
        }
        l.paint['text-color'] = sl === 'water_name' || sl === 'waterway' ? F.wasserText
          : sl === 'transportation_name' ? '#6B5A45' : F.orah;
        l.paint['text-halo-color'] = F.krec;
        l.paint['text-halo-width'] = 1.4;
      }
    } catch { /* einzelne Ebene unverändert lassen */ }
  }
  return stil;
}

const NOTFALL_STIL: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': F.krec } }],
};

async function ladeStil(): Promise<StyleSpecification> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(STIL_URL, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(String(res.status));
    return umfaerben(await res.json());
  } catch (e) {
    console.warn('Grundkarte nicht erreichbar, zeige schlichte Karte.', e);
    return NOTFALL_STIL;
  }
}

/* ---------- Bosnien hervorheben ---------- */

function flaeche(ring: number[][]): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s / 2;
}

function maskeUmBiH(): GeoJSON.Feature {
  const aussen = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  const geom = (bih as any).features[0].geometry;
  const loecher = geom.coordinates.map((poly: number[][][]) => {
    const r = poly[0];
    return flaeche(r) > 0 ? [...r].reverse() : r; // Loch im Uhrzeigersinn
  });
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [aussen, ...loecher] } };
}

function gitterMuster(): ImageData {
  const n = 24;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = 'rgba(176,138,62,0.45)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(n, n);
  ctx.moveTo(n, 0); ctx.lineTo(0, n);
  ctx.stroke();
  return ctx.getImageData(0, 0, n, n);
}

function bihEbenen(map: MLMap) {
  const stil = map.getStyle();
  const ersteSchrift = stil.layers.find((l) => l.type === 'symbol')?.id;
  // Vektorquelle der Grundkarte (OpenStreetMap-Daten), falls vorhanden
  const osm = Object.entries(stil.sources).find(([, q]) => (q as any).type === 'vector')?.[0];

  map.addSource('bih', { type: 'geojson', data: bih as any });
  map.addSource('maske', { type: 'geojson', data: maskeUmBiH() });
  map.addImage('musebak', gitterMuster(), { pixelRatio: 2 });

  // Fläche und Abblendung der Nachbarländer: grobe Natural-Earth-Form,
  // daher nur in der Übersicht sichtbar und beim Hineinzoomen ausgeblendet.
  const ausblenden = (start: number) => ['interpolate', ['linear'], ['zoom'], 7, start, 8.5, 0] as any;
  map.addLayer({ id: 'svijet-maska', type: 'fill', source: 'maske', paint: { 'fill-color': F.krec, 'fill-opacity': ausblenden(0.6) } }, ersteSchrift);
  map.addLayer({ id: 'bih-gitter', type: 'fill', source: 'bih', paint: { 'fill-pattern': 'musebak', 'fill-opacity': ausblenden(0.9) } }, ersteSchrift);

  if (osm) {
    // Grenzlinie exakt aus den OpenStreetMap-Daten der Grundkarte
    const grenze: any = ['all',
      ['==', ['get', 'admin_level'], 2],
      ['!=', ['get', 'maritime'], 1],
      ['any', ['==', ['get', 'adm0_l'], 'BIH'], ['==', ['get', 'adm0_r'], 'BIH']],
    ];
    map.addLayer({ id: 'bih-sjena', type: 'line', source: osm, 'source-layer': 'boundary', filter: grenze,
      paint: { 'line-color': F.cilim, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 7, 12, 12], 'line-opacity': 0.16 } }, ersteSchrift);
    map.addLayer({ id: 'bih-granica', type: 'line', source: osm, 'source-layer': 'boundary', filter: grenze,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': F.varak, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2.4, 12, 4] } }, ersteSchrift);
  } else {
    // Notfall ohne Grundkarte: eigene Grenzlinie
    map.addLayer({ id: 'bih-sjena', type: 'line', source: 'bih', paint: { 'line-color': F.cilim, 'line-width': 7, 'line-opacity': 0.16 } });
    map.addLayer({ id: 'bih-granica', type: 'line', source: 'bih', paint: { 'line-color': F.varak, 'line-width': 2.4 } });
  }
}

/* ---------- Markierungen ---------- */

function pinElement(p: Eigenschaften): HTMLButtonElement {
  const farbe = GRUPPEN[p.gruppe]?.farbe ?? F.kamen;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sp-pin';
  b.setAttribute('aria-label', `${p.titel}, ${p.stadt}`);
  b.innerHTML = `<svg viewBox="-12 -42 24 44" width="24" height="44" aria-hidden="true">
    <path d="M0 0 L-9 -14 Q-9 -30 0 -36 Q9 -30 9 -14 Z" fill="${farbe}" stroke="${F.krec}" stroke-width="2"/>
    <circle cy="-19" r="3.2" fill="${F.krec}"/></svg>`;
  return b;
}

function semseElement(anzahl: number): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sp-semse';
  b.setAttribute('aria-label', `${anzahl} natpisa – približi`);
  const blaetter = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return `<circle cx="${(26 * Math.cos(a)).toFixed(1)}" cy="${(26 * Math.sin(a)).toFixed(1)}" r="7"/>`;
  }).join('');
  b.innerHTML = `<svg viewBox="-34 -34 68 68" width="60" height="60" aria-hidden="true">
    <g fill="${F.varak}">${blaetter}<circle r="26"/></g>
    <circle r="21" fill="${F.krec}"/><circle r="18" fill="none" stroke="${F.cilim}" stroke-width="1"/></svg>
    <span>${anzahl}</span>`;
  return b;
}

/* ---------- Vorschau-Panel ---------- */

function $(id: string) { return document.getElementById(id)!; }

function zeigeVorschau(p: Eigenschaften) {
  const panel = $('pregled');
  const g = GRUPPEN[p.gruppe];
  const oznaka = $('p-oznaka');
  oznaka.textContent = ART_LABEL[p.art] ?? g.label;
  oznaka.style.background = g.text;
  $('p-naslov').textContent = p.titel;
  $('p-mjesto').textContent = p.stadt;
  $('p-datum').textContent = p.datum;
  $('p-zeile').textContent = p.ersteZeile;
  const sprachen = p.sprachen.map((s) => SPRACHE_LABEL[s]).join(', ');
  $('p-info').textContent = `${sprachen} · ${p.zeilen} ${p.zeilen === 1 ? 'redak' : p.zeilen < 5 ? 'retka' : 'redaka'}${p.schrift ? ' · ' + p.schrift : ''}`;
  ($('p-link') as HTMLAnchorElement).href = p.link;
  const img = $('p-img') as HTMLImageElement;
  const leer = $('p-kein-foto');
  if (p.foto) { img.src = p.foto; img.alt = p.fotoAlt; img.hidden = false; leer.hidden = true; }
  else { img.removeAttribute('src'); img.hidden = true; leer.hidden = false; }
  panel.hidden = false;
}

/* ---------- Start ---------- */

export async function starteKarte() {
  maplibregl.setWorkerUrl(workerUrl);
  const container = $('karta');
  const ladeAnzeige = container.parentElement?.querySelector('.musebak-laden') as HTMLElement | null;

  const [stil, daten] = await Promise.all([
    ladeStil(),
    fetch(container.dataset.quelle!).then((r) => r.json()) as Promise<GeoJSON.FeatureCollection<GeoJSON.Point, Eigenschaften>>,
  ]);
  const alle = daten.features as Punkt[];
  const nachId = new Map(alle.map((f) => [f.properties.id, f]));

  const map = new maplibregl.Map({
    container,
    style: stil,
    bounds: [[15.65, 42.5], [19.7, 45.3]],
    fitBoundsOptions: { padding: 30 },
    maxBounds: [[12.5, 41], [22.5, 46.8]],
    attributionControl: { compact: true, customAttribution: 'Obris: Natural Earth' },
    cooperativeGestures: false,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

  map.on('load', () => {
    bihEbenen(map);
    map.addSource('natpisi', { type: 'geojson', data: daten, cluster: true, clusterRadius: 55, clusterMaxZoom: 13 });
    // unsichtbare Ebene, damit die Kartendaten geladen und abgefragt werden können
    map.addLayer({ id: 'natpisi-osnova', type: 'circle', source: 'natpisi', paint: { 'circle-radius': 0, 'circle-opacity': 0 } });
    ladeAnzeige?.remove();
  });

  /* Markierungen synchron halten */
  const markierungen: Record<string, maplibregl.Marker> = {};
  let sichtbar: Record<string, maplibregl.Marker> = {};
  let ausgewaehlt: string | null = null;

  function aktualisiere() {
    const neu: Record<string, maplibregl.Marker> = {};
    for (const f of map.querySourceFeatures('natpisi')) {
      const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const props = f.properties as any;
      let schluessel: string;
      if (props.cluster) {
        schluessel = `c${props.cluster_id}`;
        if (!markierungen[schluessel]) {
          const el = semseElement(props.point_count);
          el.addEventListener('click', async () => {
            const quelle = map.getSource('natpisi') as GeoJSONSource;
            const zoom = await quelle.getClusterExpansionZoom(props.cluster_id);
            map.easeTo({ center: coords, zoom: zoom + 0.3 });
          });
          markierungen[schluessel] = new maplibregl.Marker({ element: el }).setLngLat(coords);
        }
      } else {
        schluessel = `p${props.id}`;
        if (!markierungen[schluessel]) {
          const punkt = nachId.get(props.id);
          if (!punkt) continue;
          const el = pinElement(punkt.properties);
          el.addEventListener('click', () => {
            document.querySelectorAll('.sp-pin.aktiv').forEach((x) => x.classList.remove('aktiv'));
            el.classList.add('aktiv');
            ausgewaehlt = punkt.properties.id;
            zeigeVorschau(punkt.properties);
          });
          markierungen[schluessel] = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(coords);
        }
      }
      neu[schluessel] = markierungen[schluessel];
      if (!sichtbar[schluessel]) markierungen[schluessel].addTo(map);
    }
    for (const k in sichtbar) if (!neu[k]) sichtbar[k].remove();
    sichtbar = neu;
  }
  map.on('render', () => { if (map.getSource('natpisi') && map.isSourceLoaded('natpisi')) aktualisiere(); });

  /* Vorschau schließen */
  $('p-zatvori').addEventListener('click', () => {
    $('pregled').hidden = true;
    document.querySelectorAll('.sp-pin.aktiv').forEach((x) => x.classList.remove('aktiv'));
    ausgewaehlt = null;
  });

  /* Filter */
  const suche = $('pretraga') as HTMLInputElement;
  function filtern() {
    const gruppen = new Set([...document.querySelectorAll<HTMLInputElement>('input[name=gruppe]:checked')].map((i) => i.value));
    const sprachen = new Set([...document.querySelectorAll<HTMLInputElement>('input[name=sprache]:checked')].map((i) => i.value));
    const q = suche.value.trim().toLocaleLowerCase('bs');
    const treffer = alle.filter(({ properties: p }) =>
      gruppen.has(p.gruppe) &&
      p.sprachen.some((s) => sprachen.has(s)) &&
      (!q || `${p.titel} ${p.stadt}`.toLocaleLowerCase('bs').includes(q)),
    );
    // alte Markierungen verwerfen, weil sich die Gruppen ändern
    for (const k in sichtbar) sichtbar[k].remove();
    for (const k in markierungen) delete markierungen[k];
    sichtbar = {};
    (map.getSource('natpisi') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: treffer });
    $('brojac').textContent = String(treffer.length);
    if (ausgewaehlt && !treffer.some((t) => t.properties.id === ausgewaehlt)) $('p-zatvori').click();
  }
  document.querySelectorAll('.filter input').forEach((i) => i.addEventListener('input', filtern));
}
