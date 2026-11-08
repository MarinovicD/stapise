/**
 * Arebica – Bosnisch in arabischer Schrift.
 *
 * Diese Tabelle ist die EINZIGE Stelle, an der festgelegt wird, welcher
 * lateinische Buchstabe zu welchem Arebica-Zeichen wird. Eine Änderung hier
 * wirkt auf die ganze Seite (und später auf die Ortsnamen der Karte).
 *
 * Festgelegt vom Projektinhaber am 08.11.2026.
 * Noch offen (vorläufig): o und u am Wortanfang; f, p, r, s, š, t (Vorschlag übernommen).
 */

/** Zweibuchstabige Laute – werden vor den Einzelbuchstaben geprüft */
export const DIGRAPHE: Record<string, string> = {
  'dž': 'ج',       // Cim
  'lj': 'ڵ',       // Lam mit kleinem Bogen
  'nj': 'ݩ',       // Nun mit kleinem v darüber
};

/** Konsonanten – unabhängig von der Stellung im Wort */
export const KONSONANTEN: Record<string, string> = {
  b: 'ب',
  c: 'ڄ',          // Cim mit zwei Punkten senkrecht übereinander
  'č': 'چ',        // drei Punkte: zwei oben, einer unten
  'ć': 'ݘ',        // drei Punkte: einer oben, zwei unten
  d: 'د',
  'đ': 'ڠ',        // Ğayn mit drei Punkten
  f: 'ف',
  g: 'غ',
  h: 'ح',
  j: 'ي',          // Ye mit Punkten (auch am Wortende)
  k: 'ق',          // Kaf
  l: 'ل',
  m: 'م',
  n: 'ن',
  p: 'پ',
  r: 'ر',
  s: 'س',
  'š': 'ش',
  t: 'ت',
  v: 'و',          // Vav ohne Zeichen
  z: 'ز',
  'ž': 'ژ',
  // Fremdbuchstaben, falls sie vorkommen
  q: 'ق', w: 'و', x: 'قس', y: 'ي',
};

/** Vokale – je nach Stellung im Wort verschieden */
export const VOKALE: Record<string, { anfang: string; sonst: string }> = {
  a: { anfang: 'آ', sonst: 'ا' },            // Elif mit Medde am Anfang, sonst Elif
  e: { anfang: 'ئ', sonst: 'ە' },            // Hemze auf Zacke; sonst nicht verbindendes He
  i: { anfang: 'اٖ', sonst: 'ى' },            // Elif mit Elif Hançeri darunter; sonst Elif Maksura (ohne Punkte)
  o: { anfang: 'اۉ', sonst: 'ۉ' },           // Vav mit umgedrehtem kleinem v  (Anfang: vorläufig)
  u: { anfang: 'اۆ', sonst: 'ۆ' },           // Vav mit kleinem v              (Anfang: vorläufig)
};

export const REGELN = {
  /** Satzzeichen ersetzen. Klammern: verzierte arabische Klammern, weil die Schrift
   *  normale Klammern beim Wechsel der Schreibrichtung doppelt spiegelt. */
  satzzeichen: { ',': '،', '?': '؟', ';': '؛', '(': '﴾', ')': '﴿' } as Record<string, string>,
  /** Ziffern: 'lateinisch' (123) oder 'arabisch' (١٢٣) */
  ziffern: 'arabisch' as 'lateinisch' | 'arabisch',
};

/** Feste Schreibweisen für einzelne Wörter (klein geschrieben, ohne Satzzeichen) */
export const AUSNAHMEN: Record<string, string> = {};

/** Wortanfänge mit fester Schreibweise; die bosnische Endung wird normal angehängt
 *  (Allaha → الله + ا, Allahov → الله + ۉو) */
export const PRAEFIXE: Record<string, string> = {
  allah: 'الله',
};

const ARABISCHE_ZIFFERN = '٠١٢٣٤٥٦٧٨٩';
const IST_BUCHSTABE = /\p{L}/u;

function wortUmwandeln(wort: string): string {
  if (AUSNAHMEN[wort]) return AUSNAHMEN[wort];
  let aus = '';
  let i = 0;
  for (const [praefix, fest] of Object.entries(PRAEFIXE)) {
    if (wort.startsWith(praefix)) { aus = fest; i = praefix.length; break; }
  }
  while (i < wort.length) {
    const zwei = wort.slice(i, i + 2);
    if (DIGRAPHE[zwei]) { aus += DIGRAPHE[zwei]; i += 2; continue; }
    const z = wort[i];
    if (VOKALE[z]) aus += i === 0 ? VOKALE[z].anfang : VOKALE[z].sonst;
    else if (KONSONANTEN[z]) aus += KONSONANTEN[z];
    else aus += z;
    i++;
  }
  return aus;
}

/** Wandelt bosnischen Text in Lateinschrift in Arebica um. */
export function uArebicu(text: string): string {
  const klein = text.toLocaleLowerCase('bs');
  let aus = '';
  let i = 0;
  while (i < klein.length) {
    if (IST_BUCHSTABE.test(klein[i])) {
      let j = i;
      while (j < klein.length && IST_BUCHSTABE.test(klein[j])) j++;
      aus += wortUmwandeln(klein.slice(i, j));
      i = j;
      continue;
    }
    const z = klein[i];
    if (REGELN.satzzeichen[z]) aus += REGELN.satzzeichen[z];
    else if (REGELN.ziffern === 'arabisch' && z >= '0' && z <= '9') aus += ARABISCHE_ZIFFERN[+z];
    else aus += text[i];
    i++;
  }
  return aus;
}
