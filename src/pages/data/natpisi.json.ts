import type { APIRoute } from 'astro';
import { alleInschriften, alsGeoJSON } from '../../lib/daten';

/** Wird beim Build zu /data/natpisi.json – die Karte lädt diese Datei. */
export const GET: APIRoute = async () => {
  const geo = alsGeoJSON(await alleInschriften());
  return new Response(JSON.stringify(geo), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
