/**
 * Interaktive Karte – das Herzstück der Seite.
 *
 * - Grundkarte: OpenFreeMap (OpenStreetMap-Daten, kostenlos, ohne API-Schlüssel),
 *   umgefärbt in die Farben der Stilrichtung. Fällt der Dienst aus, bleibt eine
 *   schlichte Karte aus eigenen Daten (Landesgrenze) stehen.
 * - Markierungen: als Bild-Ebenen direkt in der Karte gezeichnet (Spitzbogen =
 *   einzelne Inschrift, schlichter Kreis mit Anzahl = Gruppe). So bewegen sie sich beim
 *   Verschieben, Zoomen und Drehen exakt mit der Karte mit.
 * - Kompassrose als Nordausrichtung: dreht sich mit, ein Klick richtet nach Norden aus.
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
        // Landesname „Bosna i Hercegovina“ ausblenden – dort stehen die osmanischen Sancak-Namen
        if (l.id.startsWith('label_country') && Array.isArray(l.filter)) {
          l.filter = ['all', l.filter, ['!=', ['get', 'iso_a2'], 'BA']];
        }
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

function bihEbenen(map: MLMap) {
  const stil = map.getStyle();
  const ersteSchrift = stil.layers.find((l) => l.type === 'symbol')?.id;
  // Vektorquelle der Grundkarte (OpenStreetMap-Daten), falls vorhanden
  const osm = Object.entries(stil.sources).find(([, q]) => (q as any).type === 'vector')?.[0];

  map.addSource('bih', { type: 'geojson', data: bih as any });
  map.addSource('maske', { type: 'geojson', data: maskeUmBiH() });

  // Abblendung der Nachbarländer: grobe Natural-Earth-Form,
  // daher nur in der Übersicht sichtbar und beim Hineinzoomen ausgeblendet.
  const ausblenden = (start: number) => ['interpolate', ['linear'], ['zoom'], 7, start, 8.5, 0] as any;
  map.addLayer({ id: 'svijet-maska', type: 'fill', source: 'maske', paint: { 'fill-color': F.krec, 'fill-opacity': ausblenden(0.6) } }, ersteSchrift);

  // Osmanische Zierschicht (Sancaks um 1900, kalligraphisch beschriftet):
  // liegt in der Übersicht über der Karte und verschwindet beim Hineinzoomen.
  map.addSource('osmanska', {
    type: 'image',
    url: `${import.meta.env.BASE_URL}karte/osmanska-zierschicht.webp`,
    coordinates: [[15.55, 45.35], [19.8, 45.35], [19.8, 42.45], [15.55, 42.45]] as any,
  });
  map.addLayer({
    id: 'osmanska-zierschicht', type: 'raster', source: 'osmanska',
    paint: {
      'raster-opacity': ['interpolate', ['linear'], ['zoom'], 7.5, 0.9, 9, 0] as any,
      'raster-fade-duration': 0,
    },
  }, ersteSchrift);

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

/* ---------- Bilder für die Markierungen ---------- */

function svgBild(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return img.decode().then(() => img);
}

/** Spitzbogen-Markierung, doppelte Auflösung für scharfe Darstellung */
const pinSvg = (farbe: string, gross = false) => {
  const k = gross ? 1.3 : 1;
  const b = Math.round(28 * k), h = Math.round(48 * k);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b * 2}" height="${h * 2}" viewBox="-14 -46 28 48">
    <path d="M0 0 L-10 -15 Q-10 -33 0 -40 Q10 -33 10 -15 Z" fill="${farbe}" stroke="${F.krec}" stroke-width="2.2"/>
    <circle cy="-21" r="3.6" fill="${F.krec}"/></svg>`;
};

/** Gruppe mehrerer Inschriften: schlichter Kreis in Nussholz mit feinem Goldring */
const gruppeSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="-16 -16 32 32">
    <circle r="14.5" fill="none" stroke="${F.varak}" stroke-width="1" opacity="0.9"/>
    <circle r="12" fill="${F.orah}" fill-opacity="0.92"/></svg>`;

async function ladeBilder(map: MLMap) {
  const auftraege: Promise<void>[] = Object.entries(GRUPPEN).map(async ([id, g]) => {
    map.addImage(`pin-${id}`, await svgBild(pinSvg(g.farbe)), { pixelRatio: 2 });
  });
  auftraege.push(svgBild(pinSvg(F.lapis, true)).then((i) => map.addImage('pin-odabran', i, { pixelRatio: 2 })));
  auftraege.push(svgBild(gruppeSvg()).then((i) => map.addImage('gruppe', i, { pixelRatio: 2 })));
  await Promise.all(auftraege);
}

/* ---------- Kompassrose ---------- */

class Kompass implements maplibregl.IControl {
  private map?: MLMap;
  private knopf!: HTMLButtonElement;
  onAdd(map: MLMap) {
    this.map = map;
    const box = document.createElement('div');
    box.className = 'maplibregl-ctrl sp-kompass';
    this.knopf = document.createElement('button');
    this.knopf.type = 'button';
    this.knopf.title = 'Okreni kartu prema sjeveru';
    this.knopf.setAttribute('aria-label', 'Okreni kartu prema sjeveru');
    this.knopf.innerHTML = `<svg viewBox="-30 -30 60 60" width="56" height="56" aria-hidden="true">
      <g fill="${F.varak}"><rect x="-17" y="-17" width="34" height="34"/><rect x="-17" y="-17" width="34" height="34" transform="rotate(45)"/></g>
      <circle r="15" fill="${F.krec}"/>
      <path d="M0 -13 L4.5 0 L0 2 L-4.5 0 Z" fill="${F.cilim}"/>
      <path d="M0 13 L4.5 0 L0 -2 L-4.5 0 Z" fill="${F.kamen}"/>
      <text y="-19.5" text-anchor="middle" font-family="EB Garamond, serif" font-size="9" font-weight="600" fill="${F.krec}">S</text></svg>`;
    this.knopf.addEventListener('click', () => map.resetNorthPitch());
    box.appendChild(this.knopf);
    map.on('rotate', this.drehen);
    this.drehen();
    return box;
  }
  private drehen = () => {
    if (this.map) this.knopf.style.transform = `rotate(${-this.map.getBearing()}deg)`;
  };
  onRemove() { this.map?.off('rotate', this.drehen); }
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
  (window as any).stapisePretvori?.(panel); // Arebica, falls gewählt
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
  const hatSchrift = Boolean((stil as any).glyphs);

  const map = new maplibregl.Map({
    container,
    style: stil,
    bounds: [[15.65, 42.5], [19.7, 45.3]],
    fitBoundsOptions: { padding: 30 },
    maxBounds: [[12.5, 41], [22.5, 46.8]],
    maxPitch: 0,
    attributionControl: { compact: true, customAttribution: 'Obris: Natural Earth' },
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  map.addControl(new Kompass(), 'top-left');

  let ausgewaehlt: string | null = null;
  const auswahlFilter = () => ['==', ['get', 'id'], ausgewaehlt ?? ''] as any;

  map.on('load', async () => {
    bihEbenen(map);
    await ladeBilder(map);
    map.addSource('natpisi', { type: 'geojson', data: daten, cluster: true, clusterRadius: 55, clusterMaxZoom: 13 });

    // Gruppen: schlichter Kreis mit Anzahl
    map.addLayer({
      id: 'natpisi-grupe', type: 'symbol', source: 'natpisi', filter: ['has', 'point_count'],
      layout: {
        'icon-image': 'gruppe', 'icon-allow-overlap': true,
        'icon-size': ['interpolate', ['linear'], ['get', 'point_count'], 2, 0.85, 20, 1.15] as any,
        ...(hatSchrift ? {
          'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'],
          'text-size': 12, 'text-allow-overlap': true,
        } : {}),
      },
      paint: { 'text-color': F.krec },
    });
    // Einzelne Inschriften: Spitzbogen in der Farbe der Gruppe
    map.addLayer({
      id: 'natpisi-tacke', type: 'symbol', source: 'natpisi', filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['concat', 'pin-', ['get', 'gruppe']], 'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
      },
    });
    // Ausgewählte Inschrift: größer, in Lapis
    map.addLayer({
      id: 'natpisi-odabran', type: 'symbol', source: 'natpisi',
      filter: ['all', ['!', ['has', 'point_count']], auswahlFilter()],
      layout: { 'icon-image': 'pin-odabran', 'icon-anchor': 'bottom', 'icon-allow-overlap': true },
    });

    for (const ebene of ['natpisi-grupe', 'natpisi-tacke', 'natpisi-odabran']) {
      map.on('mouseenter', ebene, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', ebene, () => { map.getCanvas().style.cursor = ''; });
    }

    map.on('click', 'natpisi-grupe', async (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const quelle = map.getSource('natpisi') as GeoJSONSource;
      const zoom = await quelle.getClusterExpansionZoom(f.properties!.cluster_id);
      map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: zoom + 0.3 });
    });

    map.on('click', 'natpisi-tacke', (e) => {
      const id = e.features?.[0]?.properties?.id;
      const punkt = id && nachId.get(id);
      if (!punkt) return;
      ausgewaehlt = id;
      map.setFilter('natpisi-odabran', ['all', ['!', ['has', 'point_count']], auswahlFilter()]);
      zeigeVorschau(punkt.properties);
    });

    ladeAnzeige?.remove();
  });

  /* Vorschau schließen */
  $('p-zatvori').addEventListener('click', () => {
    $('pregled').hidden = true;
    ausgewaehlt = null;
    if (map.getLayer('natpisi-odabran')) map.setFilter('natpisi-odabran', ['all', ['!', ['has', 'point_count']], auswahlFilter()]);
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
    (map.getSource('natpisi') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: treffer });
    $('brojac').textContent = String(treffer.length);
    if (ausgewaehlt && !treffer.some((t) => t.properties.id === ausgewaehlt)) $('p-zatvori').click();
  }
  document.querySelectorAll('.filter input').forEach((i) => i.addEventListener('input', filtern));
}
