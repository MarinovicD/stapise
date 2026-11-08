/**
 * Umschalter Latinica / Arebica.
 * Wandelt alle bosnischen Texte der Seite in Arebica um (Tabelle: src/lib/arebica.ts)
 * und stellt die Seite auf „von rechts nach links“. Nicht umgewandelt werden:
 * andere Sprachen (lang="de", "en", "tr" …), Transliteration, Originalinschriften,
 * Eingabefelder und alles mit der Klasse "latinica".
 */
import { uArebicu } from '../lib/arebica';

type Pismo = 'latinica' | 'arebica';
const SCHLUESSEL = 'stapise-pismo';
const original = new Map<Text, string>();
const AUSNAHMEN = 'script, style, input, textarea, svg, code, .latinica, [data-pismo-izbor], .maplibregl-map';

function istBosnisch(el: Element | null): boolean {
  const mitLang = el?.closest('[lang]');
  const lang = mitLang?.getAttribute('lang') ?? 'bs';
  return lang === 'bs' || lang.startsWith('bs-Latn') || lang === 'bs-BA';
}

export function pretvori(wurzel: Node = document.body) {
  if (document.documentElement.dataset.pismo !== 'arebica') return;
  const gang = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT);
  const knoten: Text[] = [];
  while (gang.nextNode()) knoten.push(gang.currentNode as Text);
  for (const t of knoten) {
    const el = t.parentElement;
    if (!el || !t.data.trim() || el.closest(AUSNAHMEN) || !istBosnisch(el)) continue;
    if (!original.has(t)) original.set(t, t.data);
    t.data = uArebicu(original.get(t)!);
  }
}

function zurueck() {
  for (const [t, text] of original) if (t.isConnected) t.data = text;
  original.clear();
}

function setze(pismo: Pismo) {
  const html = document.documentElement;
  html.dataset.pismo = pismo;
  html.dir = pismo === 'arebica' ? 'rtl' : 'ltr';
  try { localStorage.setItem(SCHLUESSEL, pismo); } catch { /* privat */ }
  if (pismo === 'arebica') pretvori(); else zurueck();
  document.querySelectorAll<HTMLButtonElement>('[data-pismo-izbor]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.pismoIzbor === pismo)));
  window.dispatchEvent(new CustomEvent('pismo', { detail: pismo }));
}

export function startePismo() {
  const html = document.documentElement;
  setze((html.dataset.pismo as Pismo) || 'latinica');
  html.classList.remove('pismo-ceka');
  document.querySelectorAll<HTMLButtonElement>('[data-pismo-izbor]').forEach((b) =>
    b.addEventListener('click', () => setze(b.dataset.pismoIzbor as Pismo)));
  (window as any).stapisePretvori = pretvori;
}
