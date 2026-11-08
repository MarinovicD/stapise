/**
 * Arebica – Bosnisch in arabischer Schrift.
 *
 * Diese Tabelle ist die EINZIGE Stelle, an der festgelegt wird, welcher
 * lateinische Buchstabe zu welchem Arebica-Zeichen wird. Eine Änderung hier
 * wirkt auf die ganze Seite.
 *
 * STAND: VORLÄUFIG – wird noch vom Projektinhaber Buchstabe für Buchstabe festgelegt.
 */

/** Zweibuchstabige Laute zuerst prüfen (dž, lj, nj) */
export const DIGRAPHE: Record<string, string> = {
  'dž': 'ج',
  'lj': 'ڵ',
  'nj': 'ڽ',
};

export const BUCHSTABEN: Record<string, string> = {
  a: 'ا', b: 'ب', c: 'ڄ', 'č': 'چ', 'ć': 'ڃ', d: 'د', 'đ': 'ڟ',
  e: 'ە', f: 'ف', g: 'گ', h: 'ح', i: 'ي', j: 'ي', k: 'ك', l: 'ل',
  m: 'م', n: 'ن', o: 'ۉ', p: 'پ', r: 'ر', s: 'س', 'š': 'ش', t: 'ت',
  u: 'و', v: 'ۏ', z: 'ز', 'ž': 'ژ',
  // Fremdbuchstaben, falls sie vorkommen
  q: 'ك', w: 'ۏ', x: 'كس', y: 'ي',
};

export const REGELN = {
  /** Vokal am Wortanfang bekommt ein Träger-Elif davor (z. B. ime → ايمە) */
  traegerElifVorVokal: true,
  /** Vokale, für die die Träger-Regel gilt (a ist selbst ein Elif) */
  vokale: ['e', 'i', 'o', 'u'],
  /** Satzzeichen ersetzen */
  satzzeichen: { ',': '،', '?': '؟', ';': '؛', '(': '﴾', ')': '﴿' } as Record<string, string>,
  /** Ziffern: 'lateinisch' (123) oder 'arabisch' (١٢٣) */
  ziffern: 'lateinisch' as 'lateinisch' | 'arabisch',
};

const ARABISCHE_ZIFFERN = '٠١٢٣٤٥٦٧٨٩';
const IST_BUCHSTABE = /\p{L}/u;

/** Wandelt bosnischen Text in Lateinschrift in Arebica um. */
export function uArebicu(text: string): string {
  const klein = text.toLocaleLowerCase('bs');
  let aus = '';
  let i = 0;
  while (i < klein.length) {
    const zeichen = klein[i];
    const wortanfang = i === 0 || !IST_BUCHSTABE.test(klein[i - 1]);

    const zwei = klein.slice(i, i + 2);
    if (DIGRAPHE[zwei]) {
      aus += DIGRAPHE[zwei];
      i += 2;
      continue;
    }
    if (BUCHSTABEN[zeichen]) {
      if (wortanfang && REGELN.traegerElifVorVokal && REGELN.vokale.includes(zeichen)) aus += 'ا';
      aus += BUCHSTABEN[zeichen];
    } else if (REGELN.satzzeichen[zeichen]) {
      aus += REGELN.satzzeichen[zeichen];
    } else if (REGELN.ziffern === 'arabisch' && zeichen >= '0' && zeichen <= '9') {
      aus += ARABISCHE_ZIFFERN[+zeichen];
    } else {
      aus += text[i]; // Leerzeichen, Bindestriche, Zahlen, Satzzeichen bleiben
    }
    i++;
  }
  return aus;
}
