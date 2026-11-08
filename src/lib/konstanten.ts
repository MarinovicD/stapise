/** Feste Listen und Beschriftungen, die überall gebraucht werden. */

export const ARTEN = [
  'moschee', 'mesdzid', 'grabstein', 'brunnen', 'sebilj',
  'bruecke', 'tekke', 'tuerbe', 'han', 'haus', 'sonstiges',
] as const;
export type Art = (typeof ARTEN)[number];

export const SPRACHEN = ['arabisch', 'osmanisch', 'persisch', 'bosnisch'] as const;
export type Sprache = (typeof SPRACHEN)[number];

/** Gruppen für Filter und Farben auf der Karte */
export const GRUPPEN = {
  // farbe = Markierung und Etikett · text = dieselbe Farbe, dunkel genug für Schrift auf Kalkweiß
  dzamija: { label: 'Džamija i mesdžid', farbe: '#4A5230', text: '#4A5230', arten: ['moschee', 'mesdzid'] },
  nisan: { label: 'Nišan', farbe: '#6B5A45', text: '#5C4D3B', arten: ['grabstein'] },
  voda: { label: 'Česma i sebilj', farbe: '#2F8A8C', text: '#22696B', arten: ['brunnen', 'sebilj'] },
  most: { label: 'Most', farbe: '#1F2E66', text: '#1F2E66', arten: ['bruecke'] },
  tekija: { label: 'Tekija i turbe', farbe: '#9B2C2A', text: '#9B2C2A', arten: ['tekke', 'tuerbe'] },
  ostalo: { label: 'Han, kuća, ostalo', farbe: '#8A7B66', text: '#5F5242', arten: ['han', 'haus', 'sonstiges'] },
} as const;
export type Gruppe = keyof typeof GRUPPEN;

export function gruppeVon(art: Art): Gruppe {
  for (const [g, def] of Object.entries(GRUPPEN)) {
    if ((def.arten as readonly string[]).includes(art)) return g as Gruppe;
  }
  return 'ostalo';
}

export const ART_LABEL: Record<Art, string> = {
  moschee: 'Džamija', mesdzid: 'Mesdžid', grabstein: 'Nišan', brunnen: 'Česma',
  sebilj: 'Sebilj', bruecke: 'Most', tekke: 'Tekija', tuerbe: 'Turbe',
  han: 'Han', haus: 'Kuća', sonstiges: 'Ostalo',
};

export const SPRACHE_LABEL: Record<Sprache, string> = {
  arabisch: 'Arapski', osmanisch: 'Osmanski turski', persisch: 'Perzijski', bosnisch: 'Bosanski (arebica)',
};

/** Sprachen der Übersetzungen, in der Reihenfolge der Tabs */
export const UEBERSETZUNGEN = [
  { code: 'bs', label: 'Bosanski' },
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'tr', label: 'Türkçe' },
] as const;

export const SEITE = {
  name: 'Šta piše?',
  untertitel: 'Osmanski natpisi u Bosni i Hercegovini',
  ornament: 'کتابه', // kitâbe – „Inschrift“
};

/** Datierung lesbar machen: "1073. h. / 1662." */
export function datierungText(d: { hidschri: number | null; gregorianisch: number | null; anzeige?: string }): string {
  if (d.anzeige) return d.anzeige;
  const teile: string[] = [];
  if (d.hidschri) teile.push(`${d.hidschri}. h.`);
  if (d.gregorianisch) teile.push(`${d.gregorianisch}.`);
  return teile.length ? teile.join(' / ') : 'nije datirano';
}

/** Link mit Basis-Pfad (wichtig, solange die Seite unter /<repo>/ läuft) */
export function url(pfad = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${pfad.replace(/^\//, '')}`;
}
