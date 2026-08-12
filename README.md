# Paulushaus · Raumplaner

Raum- und Terminkoordination für ein Haus mit mehreren Räumen.
Ein Raum = ein Kalender = eine Farbe, alle Kalender überlagert in einem Gesamtkalender.

Next.js 15 (App Router) · Postgres (Neon / Vercel Postgres) · Drizzle ORM · Auth.js v5 · Resend

---

## Funktionsumfang

**Kalender** – Woche, Tag, Monat und Raum-Timeline. Räume einzeln oder gruppenweise ein- und ausblenden.
Termine per Klick & Ziehen direkt im Stundenraster anlegen (15-Minuten-Raster).

**Rollen** – Admins tragen Termine direkt ein, geben Anfragen frei, verwalten Nutzer und Räume.
Nutzer stellen Anfragen. Keine Selbstregistrierung: Admins laden per E-Mail ein.

**Benachrichtigungen** – bei einer neuen Anfrage bekommen alle aktiven Admins eine E-Mail
(einzeln verschickt, damit die Adressen nicht gegenseitig sichtbar werden) mit Raum, Zeitraum,
Anmerkung und einem Hinweis, falls sich die Anfrage mit einem bestätigten Termin überschneidet.
Der Anfragende wird per Mail über Zusage oder Absage informiert.

**Mehrtägige Termine** – zwei Arten:
*durchgehend* (Raum ist auch nachts belegt, z. B. Aufbau oder Übernachtung) und
*täglich wiederkehrend* (gleiches Zeitfenster an mehreren Tagen, z. B. ein Ferienworkshop).
Die Konfliktprüfung vergleicht tageweise.

**Öffentliche Ansicht** – `/oeffentlich`, ohne Login. Zeigt ausschließlich Raum und Zeitraum,
gekennzeichnet als „belegt“. Titel, Veranstalter und Notizen verlassen den Server gar nicht erst.
Aushang-Modus für einen Bildschirm im Foyer: `/oeffentlich?kiosk=1`.
Einzelne Räume lassen sich in der Raumverwaltung von der öffentlichen Ansicht ausnehmen.

**Export & Druck** – Monatslisten je Raum, einzeln oder mehrere zusammen als PDF (eine A4-Seite pro Raum).
Pro Raum wird angezeigt, ob sich der Plan seit dem letzten Export geändert hat.

---

## Deployment auf Vercel

### 1. Datenbank anlegen

Neon (<https://neon.tech>) oder Vercel Postgres. Beides funktioniert – gebraucht wird nur ein
Postgres-Connection-String. **Bei Neon den „Pooled connection“-String verwenden**
(Host mit `-pooler`), damit serverlose Funktionen keine Verbindungen aufstauen.

### 2. Repository zu GitHub

```bash
git init
git add .
git commit -m "Raumplaner"
git remote add origin git@github.com:DEIN-ACCOUNT/paulushaus-raumplaner.git
git push -u origin main
```

### 3. In Vercel importieren

„Add New… → Project“, das Repository wählen. Framework wird als Next.js erkannt,
Build- und Output-Einstellungen bleiben auf den Vorgaben.

### 4. Environment Variables setzen

In Vercel unter **Settings → Environment Variables** (für Production *und* Preview):

| Variable | Pflicht | Beschreibung |
|---|:--:|---|
| `DATABASE_URL` | ✓ | Postgres-Connection-String, mit `?sslmode=require` |
| `AUTH_SECRET` | ✓ | Zufallswert, erzeugen mit `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | ✓ | Öffentliche URL, z. B. `https://raumplaner.vercel.app` – landet in den Einladungslinks |
| `RESEND_API_KEY` | ✓ | API-Key von <https://resend.com> |
| `RESEND_FROM` | ✓ | Absender, z. B. `Raumplaner <raumplaner@deine-domain.de>` – Domain muss in Resend verifiziert sein |
| `APP_TIMEZONE` | – | Standard `Europe/Berlin`. Nur ändern, wenn das Haus woanders steht |

> Ohne `RESEND_API_KEY` läuft die App weiter – dann zeigt die Oberfläche den Einladungslink
> zum Kopieren an, statt eine Mail zu verschicken. Praktisch für den ersten Test.

### 5. Deployen – Datenbank richtet sich selbst ein

Der Build-Befehl ist `npm run db:deploy && next build`. Vor jedem Build spielt Vercel
also die Migrationen aus `drizzle/` ein und legt beim allerersten Mal den Admin-Account an.
Ein manueller Schritt ist nicht nötig – einfach deployen.

Was `db:deploy` tut (`scripts/prepare-db.ts`):

1. Nimmt eine Session-weite Advisory-Lock, damit zwei gleichzeitige Builds nicht dieselbe
   Migration nebeneinander fahren.
2. Spielt alle noch nicht angewandten Migrationen ein. Bereits angewandte werden übersprungen –
   Drizzle merkt sich das in der Tabelle `drizzle.__drizzle_migrations`.
3. Legt einen Admin an, **wenn es noch gar keinen gibt** und `SEED_ADMIN_EMAIL` +
   `SEED_ADMIN_PASSWORD` gesetzt sind. Existiert bereits ein Admin, passiert nichts.
   Das Passwort wird also nicht bei jedem Deploy zurückgesetzt.

Fehlt `DATABASE_URL`, wird der Schritt mit einer Warnung übersprungen und der Build läuft
trotzdem durch. Ein echter Migrationsfehler bricht den Build dagegen ab – gewollt, sonst
ginge eine App live, deren Schema nicht zum Code passt.

**Zusätzliche Variablen für diesen Schritt** (alle optional):

| Variable | Zweck |
|---|---|
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | erster Admin-Account, mind. 10 Zeichen Passwort. Nach dem ersten erfolgreichen Deploy kannst du sie wieder entfernen |
| `DIRECT_DATABASE_URL` | ungepoolte Verbindung nur für Migrationen. Bei Neon empfohlen: DDL über den Pooler kann hängen bleiben. Ohne diese Variable wird `DATABASE_URL` benutzt |
| `SKIP_DB_MIGRATE=1` | Migration in dieser Umgebung überspringen – sinnvoll für Preview-Deployments, die auf dieselbe Datenbank zeigen |

> **Preview-Deployments:** zeigen sie auf dieselbe `DATABASE_URL` wie Production, wandert jede
> Migration aus einem Branch sofort in die Produktivdatenbank. Entweder eine eigene
> Datenbank für Preview hinterlegen oder dort `SKIP_DB_MIGRATE=1` setzen.

### 6. Erste Schritte in der App

1. Unter der Vercel-URL mit dem Admin-Account anmelden.
2. **Räume** → zuerst eine Gruppe anlegen (z. B. „Erdgeschoss“), dann die Räume mit Farbe,
   Plätzen und Ausstattung. Jeder Raum wird automatisch zu einem eigenen Kalender.
3. **Nutzer** → Personen einladen. Sie bekommen einen Link und setzen ihr Passwort selbst.
4. Fertig. Der öffentliche Plan liegt unter `/oeffentlich`.

---

## Lokale Entwicklung

```bash
npm install
cp .env.example .env       # DATABASE_URL auf eine lokale oder Neon-Datenbank zeigen lassen
npm run db:migrate         # Tabellen anlegen und ggf. ersten Admin bootstrappen
npm run dev                # http://localhost:3000
```

Nach Änderungen am Schema (`src/lib/db/schema.ts`):

```bash
npm run db:generate        # erzeugt eine neue Migration in drizzle/
npm run db:migrate         # spielt sie ein
```

Die neue Migration **muss mitcommittet werden** – der Vercel-Build spielt genau die Dateien
aus `drizzle/` ein, nicht das Schema-File.

`npm run seed` ist davon getrennt: es setzt das Passwort eines Admin-Accounts hart neu
(oder legt ihn an) und ist der Weg, wenn man sich ausgesperrt hat.

---

## Aufbau

```
src/
  app/
    (app)/            angemeldeter Bereich: Kalender, Anfragen, Export, Nutzer, Räume
    oeffentlich/      öffentliche Belegung, ohne Login
    print/            Druckansicht der Monatslisten (nur Admin)
    invite/[token]/   Passwort über Einladungslink setzen
    login/
  components/         Oberfläche; CalendarViews.tsx enthält alle vier Ansichten
  lib/
    db/schema.ts      Drizzle-Schema
    data.ts           Leseabfragen
    actions/          Server Actions (schreibende Vorgänge)
    calendar.ts       Termin-Logik: Tagesausschnitte, Überschneidungen, Spaltenaufteilung
    dates.ts          Datums- und Zeit-Helfer
drizzle/              generierte Migrationen
scripts/              prepare-db.ts (Migration + Admin-Bootstrap), seed.ts (Admin-Passwort setzen)
```

### Zwei Entscheidungen, die beim Weiterbauen wichtig sind

**Zeit wird als lokale Wandzeit gespeichert.** `bookings` hat getrennte Spalten für Datum und
Uhrzeit statt eines Zeitstempels. Die App läuft an genau einem Standort, deshalb ist das die
ehrlichere Form: „Chorprobe um 19:00“ bleibt 19:00, auch über die Zeitumstellung hinweg.
Damit „heute“ serverseitig stimmt, setzt `src/instrumentation.ts` die Zeitzone auf
`Europe/Berlin` – Vercel-Funktionen laufen sonst in UTC.

**Die Konfliktprüfung läuft in der Anwendung**, nicht als Datenbank-Constraint
(`src/lib/actions/bookings.ts` → `findConflicts`). Grund: ein `EXCLUDE`-Constraint über einen
Zeitbereich kann „täglich wiederkehrend“ nicht abbilden, ohne jede Tagesinstanz zu
materialisieren. Bei gleichzeitigen Eintragungen im selben Raum ist damit theoretisch eine
Doppelbuchung möglich – für ein Haus mit einer Handvoll Admins ist das vertretbar. Wer das
härter braucht, materialisiert `DAILY`-Termine in eine `booking_days`-Tabelle und setzt dort
den Exclusion-Constraint.

### Konfliktinfos verlassen den Server nicht

`findConflicts` läuft auch bei Anfragen von Nutzern – das Ergebnis geht aber nur in die
Admin-Mail, nicht an den Anfragenden zurück. Sonst könnte man über wiederholte Anfragen
herausfinden, wer wann welchen Raum belegt hat.

### Löschen ist ein Soft Delete

Abgesagte Termine bekommen `status = CANCELLED` und bleiben in der Datenbank. Nur so kann der
Export melden, dass sich der ausgehängte Plan seit dem Druck geändert hat.
