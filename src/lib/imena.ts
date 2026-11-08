/**
 * Ortsnamen auf der Karte: historische Namen und Ergänzungen.
 *
 * Die Kartendaten (OpenStreetMap) enthalten die heutigen amtlichen Namen.
 * Hier wird festgelegt, welche Orte stattdessen ihren historischen Namen tragen.
 * Gilt für die lateinische und die Arebica-Beschriftung.
 *
 * `bei`: ungefähre Lage [Länge, Breite] – nötig, wenn es mehrere Orte gleichen Namens gibt.
 */
export const HISTORISCHE_NAMEN: { heute: string; historisch: string; bei?: [number, number] }[] = [
  { heute: 'Kneževo', historisch: 'Skender Vakuf', bei: [17.38, 44.49] },
  { heute: 'Mrkonjić Grad', historisch: 'Varcar Vakuf', bei: [17.08, 44.42] },
  { heute: 'Gradiška', historisch: 'Bosanska Gradiška', bei: [17.25, 45.15] },
  { heute: 'Brod', historisch: 'Bosanski Brod', bei: [18.0, 45.15] },
  { heute: 'Šamac', historisch: 'Bosanski Šamac', bei: [18.47, 45.06] },
  { heute: 'Novi Grad', historisch: 'Bosanski Novi', bei: [16.38, 45.05] },
  { heute: 'Kostajnica', historisch: 'Bosanska Kostajnica', bei: [16.55, 45.22] },
  { heute: 'Petrovo', historisch: 'Bosansko Petrovo Selo', bei: [18.36, 44.63] },
];

/** Orte, die in den Kartendaten fehlen (z. B. weil sie direkt an der Grenze liegen).
 *  klasse: 1 Stadt · 2 Kleinstadt · 3 Dorf */
export const ZUSAETZLICHE_ORTE: { name: string; lon: number; lat: number; klasse: 1 | 2 | 3 }[] = [
  { name: 'Bosanska Dubica', lon: 16.8094, lat: 45.1772, klasse: 2 }, // heute: Kozarska Dubica
];

/** Nachbarländer: nur ihr Name erscheint auf der Karte */
export const NACHBARLAENDER: { name: string; lon: number; lat: number }[] = [
  { name: 'Hrvatska', lon: 16.95, lat: 45.55 },
  { name: 'Hrvatska', lon: 16.35, lat: 43.55 },
  { name: 'Srbija', lon: 19.9, lat: 44.25 },
  { name: 'Crna Gora', lon: 19.15, lat: 42.72 },
];

export function historischerName(name: string, lon: number, lat: number): string {
  for (const h of HISTORISCHE_NAMEN) {
    if (h.heute !== name) continue;
    if (!h.bei || (Math.abs(h.bei[0] - lon) < 0.06 && Math.abs(h.bei[1] - lat) < 0.06)) return h.historisch;
  }
  return name;
}
