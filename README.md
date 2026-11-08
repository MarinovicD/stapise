# Šta piše?

**Osmanski natpisi u Bosni i Hercegovini.** Ein Archiv osmanischer Inschriften in Bosnien und Herzegowina, mit Transkription, Transliteration und Übersetzung. Herzstück ist eine interaktive Karte.

---

## Was ist was

```
src/content/inschriften/   ← HIER liegen die Inschriften (eine JSON-Datei pro Inschrift)
public/fotos/              ← fertige Web-Fotos (werden mit hochgeladen)
fotos-original/            ← deine Originalfotos (bleiben NUR auf deinem Rechner)
src/pages/                 ← die Seiten: Karte, Liste, Leseansicht, Über das Projekt
src/components/            ← Gestaltungselemente: Ebru, Cetvel, Mušebak
src/styles/global.css      ← Farben, Schriften, Grundgestaltung
src/lib/konstanten.ts      ← Name der Seite, Kategorien, Farben der Kategorien
scripts/                   ← Hilfsprogramme (Fotos umwandeln, Ebru-Textur erzeugen)
```

## Einmalig: einrichten

1. **Node.js** installieren (Version 22 oder neuer): https://nodejs.org
2. Im Projektordner ein Terminal öffnen und ausführen:
   ```
   npm install
   ```
3. Seite lokal ansehen:
   ```
   npm run dev
   ```
   Dann im Browser http://localhost:4321 öffnen. Änderungen erscheinen sofort.

## Eine neue Inschrift eintragen

1. Die Datei `src/content/inschriften/_VORLAGE.json.txt` kopieren und umbenennen, z. B. in `mostar-karadjoz-begova-ulaz.json`.
   Der Dateiname wird zur Adresse: `…/natpisi/mostar-karadjoz-begova-ulaz/`. Nur Kleinbuchstaben, Ziffern und Bindestriche verwenden.
2. Felder ausfüllen. Die wichtigsten:
   - `status`: `"entwurf"` (nur lokal sichtbar) oder `"veroeffentlicht"` (geht online)
   - `art`: `moschee`, `mesdzid`, `grabstein`, `brunnen`, `sebilj`, `bruecke`, `tekke`, `tuerbe`, `han`, `haus`, `sonstiges`
   - `sprachen`: Liste aus `arabisch`, `osmanisch`, `persisch`, `bosnisch`
   - `ort.lat` / `ort.lng`: Koordinaten (in Google Maps: Rechtsklick auf den Ort, dann die Zahlen anklicken, um sie zu kopieren)
   - `zeilen`: **eine Zeile der Inschrift = ein Eintrag**, jeweils mit `original`, `transliteration`, `uebersetzung`
3. Leere optionale Felder (`""`) einfach löschen.
4. `npm run dev` zeigt sofort, ob alles stimmt. Ist ein Feld falsch, nennt die Fehlermeldung die Datei und das Feld.

Die drei Dateien `primjer-*.json` sind **Beispiele** mit erfundenen Angaben. Lösche sie, sobald echte Einträge da sind.

## Fotos hinzufügen

1. Originalfotos in den Ordner `fotos-original/` legen.
2. Ausführen:
   ```
   npm run fotos
   ```
   Das Skript verkleinert die Fotos auf höchstens 2000 px, wandelt sie in WebP um und **entfernt GPS-Position und Kameradaten**. Das Ergebnis landet in `public/fotos/`.
3. In der Inschrift unter `fotos` den neuen Dateinamen eintragen (z. B. `"datei": "mostar-dzamija-1.webp"`).

Die Originale werden nicht hochgeladen. **Sichere sie separat**, sie sind dein eigentliches Archiv.

## Veröffentlichen auf GitHub Pages

Einmalig:
1. Auf GitHub ein neues Repository anlegen und diesen Ordner hochladen.
2. Im Repository: **Settings › Pages › Build and deployment › Source: „GitHub Actions“**.
3. Solange es keine eigene Domain gibt: unter **Settings › Secrets and variables › Actions › Variables** zwei Variablen anlegen:
   - `BASE_PATH` = `/name-des-repositorys/`
   - `SITE_URL` = `https://dein-github-name.github.io`

Danach wird die Seite bei jedem Hochladen auf den Branch `main` automatisch neu gebaut (Reiter **Actions**).

### Eigene Domain (z. B. stapise.ba)
1. Beim Domain-Anbieter die DNS-Einträge für GitHub Pages setzen (Anleitung: GitHub Docs, „Managing a custom domain for your GitHub Pages site“).
2. Eine Datei `public/CNAME` anlegen, Inhalt nur: `stapise.ba`
3. Die Variable `BASE_PATH` löschen und `SITE_URL` auf `https://stapise.ba` setzen.

## Später: Umzug auf eigenes Webhosting

Die Seite ist so gebaut, dass sie überall läuft: `npm run build` erzeugt den Ordner `dist/` mit fertigen Dateien, die auf jeden Webserver passen. Beim Umzug ändert sich nur der letzte Schritt im Workflow `.github/workflows/deploy.yml` (Hochladen per FTP/SSH statt GitHub Pages). Die Domain bleibt gleich, alle Links bleiben gültig.

## Technik

- [Astro](https://astro.build) erzeugt aus den Daten statische Seiten.
- [MapLibre GL JS](https://maplibre.org) zeigt die Karte. Grundkarte: [OpenFreeMap](https://openfreemap.org), Daten © OpenStreetMap. Grenzlinie aus den OpenStreetMap-Daten der Grundkarte; Landesfläche für die Übersicht: Natural Earth (gemeinfrei).
- Die Schriften liegen auf dem eigenen Server (EB Garamond, Amiri, Noto Nastaliq Urdu), also ohne Verbindung zu Google Fonts. Das ist wichtig für den Datenschutz.
- Die Ebru-Texturen werden mit `npm run ebru` mathematisch erzeugt (Python mit numpy und Pillow), damit keine fremden Bildrechte im Spiel sind.

## Osmanische Zierschicht der Karte

In der Übersicht liegt über der Karte eine Zierschicht im Stil des osmanischen Atlasblatts *Bosna Vilayeti* (1907): die Sancak-Grenzen (näherungsweise, auf die heutige Landesgrenze zugeschnitten) und die Namen der Sancaks in Rik'a-Kalligraphie, ausgerichtet nach der Form des Gebiets. Beim Hineinzoomen blendet sie aus.

Die Schicht ist neu gezeichnet; der Scan selbst wird nicht veröffentlicht. Neu erzeugen (z. B. nach Korrektur eines Namens in `scripts/osmanska-karta/erzeuge.py`):
```
python3 scripts/osmanska-karta/erzeuge.py PFAD/ZUM/SCAN.jpg
python3 scripts/osmanska-karta/rendern.py
```
