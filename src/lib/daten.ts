import { getCollection, type CollectionEntry } from 'astro:content';
import { gruppeVon, datierungText, url } from './konstanten';

export type Inschrift = CollectionEntry<'inschriften'>;

/** Alle Inschriften, die angezeigt werden dürfen.
 *  Entwürfe sind nur beim lokalen Arbeiten (npm run dev) sichtbar. */
export async function alleInschriften(): Promise<Inschrift[]> {
  const alle = await getCollection('inschriften', ({ data }) =>
    data.status !== 'entwurf' || import.meta.env.DEV,
  );
  return alle.sort((a, b) => b.data.erfasst.getTime() - a.data.erfasst.getTime());
}

/** Kompakte Daten für die Karte (GeoJSON) */
export function alsGeoJSON(liste: Inschrift[]) {
  return {
    type: 'FeatureCollection',
    features: liste.map((e) => {
      const d = e.data;
      const foto = d.fotos[0];
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [d.ort.lng, d.ort.lat] },
        properties: {
          id: e.id,
          titel: d.titel.bs,
          art: d.art,
          gruppe: gruppeVon(d.art),
          stadt: d.ort.stadt,
          sprachen: d.sprachen,
          jahr: d.datierung.gregorianisch,
          datum: datierungText(d.datierung),
          ersteZeile: d.zeilen[0]?.original ?? '',
          zeilen: d.zeilen.length,
          schrift: d.schrift ?? '',
          foto: foto ? url(`fotos/${foto.datei}`) : null,
          fotoAlt: foto?.alt ?? '',
          link: url(`natpisi/${e.id}/`),
          beispiel: d.status === 'beispiel',
        },
      };
    }),
  };
}
