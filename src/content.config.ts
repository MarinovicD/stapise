/**
 * Datenformat einer Inschrift.
 *
 * Jede Inschrift ist eine JSON-Datei in src/content/inschriften/.
 * Der Dateiname (ohne .json) wird zur Adresse: mostar-primjer.json → /natpisi/mostar-primjer/
 *
 * Felder mit .optional() dürfen fehlen. Fehlt ein Pflichtfeld oder hat es
 * den falschen Typ, bricht der Build mit einer verständlichen Fehlermeldung ab –
 * so kann kein kaputter Eintrag online gehen.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { ARTEN, SPRACHEN } from './lib/konstanten';

/** Sprachen der Übersetzungen (Oberfläche und Inhalte) */
const mehrsprachig = z.object({
  bs: z.string(),
  de: z.string().optional(),
  en: z.string().optional(),
  tr: z.string().optional(),
});

const zeile = z.object({
  /** Transkription in Originalschrift (arabisches Alphabet) */
  original: z.string(),
  /** Umschrift in lateinischen Buchstaben */
  transliteration: z.string(),
  /** Übersetzung dieser Zeile */
  uebersetzung: mehrsprachig,
});

const foto = z.object({
  /** Dateiname in public/fotos/, z. B. "mostar-primjer-1.webp" */
  datei: z.string(),
  /** Bildbeschreibung für Screenreader und Suchmaschinen */
  alt: z.string(),
  fotograf: z.string().optional(),
  jahr: z.number().int().optional(),
  lizenz: z.string().default('CC BY 4.0'),
});

const inschriften = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/inschriften' }),
  schema: z.object({
    /** veroeffentlicht = online · entwurf = nur lokal sichtbar · beispiel = Demo-Daten */
    status: z.enum(['veroeffentlicht', 'entwurf', 'beispiel']).default('entwurf'),
    /** Eigene Inventarnummer, z. B. "SP-0001" */
    inventarnummer: z.string(),
    titel: mehrsprachig,
    art: z.enum(ARTEN),
    ort: z.object({
      stadt: z.string(),
      bauwerk: z.string().optional(),
      /** Wo am Bauwerk, z. B. "iznad ulaza" */
      position: z.string().optional(),
      lat: z.number().min(42).max(46),
      lng: z.number().min(15).max(20),
      genauigkeit: z.enum(['exakt', 'ungefaehr']).default('exakt'),
    }),
    sprachen: z.array(z.enum(SPRACHEN)).min(1),
    /** Schriftart, z. B. "Celî-Sülüs", "Ta'lik", "Nesih" */
    schrift: z.string().optional(),
    /** Träger der Inschrift, z. B. "kamena ploča", "nišan", "levha" */
    traeger: z.string().optional(),
    material: z.string().optional(),
    datierung: z.object({
      hidschri: z.number().int().nullable().default(null),
      gregorianisch: z.number().int().nullable().default(null),
      /** Freitext, falls die Datierung unsicher ist, z. B. "oko 1600." */
      anzeige: z.string().optional(),
      /** Ist das Datum als Chronogramm (Tarih) verschlüsselt? */
      chronogramm: z.boolean().default(false),
    }),
    stifter: z.string().optional(),
    kalligraph: z.string().optional(),
    zustand: z.string().optional(),
    zeilen: z.array(zeile).min(1),
    kommentar: mehrsprachig.optional(),
    fotos: z.array(foto).default([]),
    literatur: z.array(z.string()).default([]),
    /** Datum der Erfassung, Format JJJJ-MM-TT */
    erfasst: z.coerce.date(),
    aktualisiert: z.coerce.date().optional(),
    /** projekt = eigene Erfassung · einsendung = von Besuchern (Phase 2) */
    quelle: z.enum(['projekt', 'einsendung']).default('projekt'),
  }),
});

export const collections = { inschriften };
