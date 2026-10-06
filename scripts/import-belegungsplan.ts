/**
 * Einmal-Import der Excel-Belegungspläne (SAAL / ROT / BLAU / VIOLETT / PURPUR).
 *
 * Bewusst KEIN Teil der App und nicht im Build: nur von Hand aufrufen.
 *
 *   npm run import:plan -- --file "…/2026er Plan.xlsx"                  # Trockenlauf, schreibt nichts
 *   npm run import:plan -- --file "…/2026er Plan.xlsx" --commit         # schreibt in die Datenbank
 *   npm run import:plan -- --file "…" --map "SAAL=Großer Saal,ROT=Roter Raum"
 *   npm run import:plan -- --file "…" --create-missing --commit
 *   npm run import:plan -- --undo "belegungsplan-2026"                  # Import zurücknehmen
 *
 * Optionen
 *   --file <pfad>        Excel-Datei (mehrfach angebbar)
 *   --commit             tatsächlich schreiben (ohne: reiner Trockenlauf)
 *   --tag <name>         Import-Kennung; Standard: belegungsplan-<Jahr aus Dateiname>
 *   --map A=B,C=D        Blattname → Raumname in der Datenbank
 *   --create-missing     Räume anlegen, die sich nicht zuordnen lassen
 *   --created-by <mail>  Termine diesem Konto zuschreiben; Standard: erster Admin
 *   --undo <tag>         alle Termine dieses Imports löschen
 *   --report <pfad>      Pfad des Berichts; Standard: import-report-<tag>.md
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import ExcelJS from 'exceljs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, asc, eq, sql } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';
import { normalizeDatabaseUrl, maskUrl } from '../src/lib/db/url';

const { bookings, rooms, roomGroups, users } = schema;

/* ---------------------------------------------------------------- Konventionen */

/** „ganztägig“ füllt genau das Zeitraster der App (siehe src/lib/dates.ts) */
const ALLDAY_START = '07:00';
const ALLDAY_END = '23:00';
/** Zeilen ohne jede Uhrzeit werden zu einem einstündigen Platzhalter */
const PLACEHOLDER_START = '09:00';
const PLACEHOLDER_END = '10:00';
/** Fehlt die Endzeit bei gesetzter Startzeit */
const DEFAULT_DURATION_MIN = 120;
/** Diese Blätter enthalten keine Belegung */
const SKIP_SHEETS = ['kontakte', 'bastelstube', 'ts'];

/* ---------------------------------------------------------------- Argumente */

function args() {
  const a = process.argv.slice(2);
  const files: string[] = [];
  const out: Record<string, string> = {};
  let commit = false, createMissing = false;
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--commit') commit = true;
    else if (k === '--create-missing') createMissing = true;
    else if (k === '--file') files.push(a[++i]);
    else if (k.startsWith('--')) out[k.slice(2)] = a[++i];
  }
  return { files, commit, createMissing, opt: out };
}

/* ---------------------------------------------------------------- Zeit-Parser */

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

type TimeKind = 'time' | 'allday' | 'until' | 'none';
interface Parsed { kind: TimeKind; value?: string; raw: string }

/**
 * Excel liefert Uhrzeiten je nach Zelle als Date, als „13:15“ oder als „21.00“.
 * Ein Date mit dem Excel-Nulldatum und 00:00 ist eine leere Zelle, kein Mitternacht.
 */
function parseTime(v: unknown): Parsed {
  if (v === null || v === undefined) return { kind: 'none', raw: '' };

  if (v instanceof Date) {
    const h = v.getUTCHours(), m = v.getUTCMinutes();
    const local = v.getHours() * 60 + v.getMinutes();
    const utc = h * 60 + m;
    const minutes = utc === 0 && local !== 0 ? local : utc;
    if (minutes === 0) return { kind: 'none', raw: v.toISOString() };
    return { kind: 'time', value: hhmm(minutes), raw: hhmm(minutes) };
  }

  const s = cellText(v).trim();
  if (!s) return { kind: 'none', raw: '' };
  const low = s.toLowerCase();
  if (low === 'ganztägig' || low === 'ganztaegig' || low === 'ganztags') return { kind: 'allday', raw: s };
  if (low === 'bis') return { kind: 'until', raw: s };

  const m = s.match(/^(\d{1,2})[.:,h]?(\d{2})?\s*(?:uhr)?$/i);
  if (m) {
    const h = Number(m[1]), mi = Number(m[2] ?? 0);
    if (h <= 24 && mi < 60) {
      const total = h === 24 ? 23 * 60 : h * 60 + mi;
      if (total === 0) return { kind: 'none', raw: s };
      return { kind: 'time', value: hhmm(total), raw: s };
    }
  }
  return { kind: 'none', raw: s };            // z. B. „nach dem Chor“, „?“
}

/**
 * ExcelJS liefert Zellen je nach Formatierung als String, als { richText: [...] },
 * als Formel mit result oder als Hyperlink. Ohne dieses Abflachen werden farbig
 * formatierte Kopfzeilen zu "[object Object]".
 */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.richText)) {
    return (o.richText as { text?: string }[]).map((t) => t.text ?? '').join('');
  }
  if (o.result !== undefined) return cellText(o.result);
  if (typeof o.text === 'string') return o.text;
  if (o.formula !== undefined) return '';
  return '';
}

/** Datumswert aus einer Zelle, auch wenn sie eine Formel ist */
function cellDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const o = v as Record<string, unknown> | null;
  if (o && o.result instanceof Date) return o.result;
  return null;
}

const clean = (v: unknown) => cellText(v).replace(/\s+/g, ' ').trim();

/* ---------------------------------------------------------------- Zeilen lesen */

interface Row {
  sheet: string;
  excelRow: number;
  date: string;              // YYYY-MM-DD
  title: string;
  contact: string;
  note: string;
  carrier: string;
  start: string;             // HH:MM
  end: string;               // HH:MM
  allday: boolean;
  untilTail: boolean;        // Zeile der Form „bis 15:00“
  notes: string[];           // Hinweise für den Bericht
}

function isoDate(d: Date) {
  // Excel-Daten kommen als UTC-Mitternacht – Zeitzone darf den Tag nicht verschieben
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function readSheet(ws: ExcelJS.Worksheet): { rows: Row[]; skipped: number } {
  // Kopfzeile: die Spalte, in deren Text „Datum“ vorkommt (dort klebt oft der Raumname davor)
  let c0 = 0;
  const head = ws.getRow(1);
  for (let c = 1; c <= ws.columnCount; c++) {
    if (cellText(head.getCell(c).value).toLowerCase().includes('datum')) { c0 = c; break; }
  }
  if (!c0) return { rows: [], skipped: 0 };

  const rows: Row[] = [];
  let lastDate = '';
  let skipped = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cell = (off: number) => row.getCell(c0 + off).value;

    const rawDate = cellDate(cell(0));
    if (rawDate) lastDate = isoDate(rawDate);

    const title = clean(cell(4));
    if (!title) { continue; }
    if (!lastDate) { skipped++; continue; }

    const notes: string[] = [];
    if (!rawDate) notes.push(`Datum aus der Zeile darüber übernommen (${lastDate})`);

    const von = parseTime(cell(2));
    const bis = parseTime(cell(3));

    let start = '', end = '', allday = false, untilTail = false;

    if (von.kind === 'allday' || bis.kind === 'allday') {
      allday = true;
      start = ALLDAY_START; end = ALLDAY_END;
      notes.push(`„ganztägig“ → ${ALLDAY_START}–${ALLDAY_END}`);
    } else if (von.kind === 'until' && bis.kind === 'time') {
      untilTail = true;
      start = ALLDAY_START; end = bis.value!;
      notes.push(`„bis ${bis.value}“ → Fortsetzung vom Vortag, ${ALLDAY_START}–${bis.value}`);
    } else if (von.kind === 'time') {
      start = von.value!;
      if (bis.kind === 'time') {
        end = bis.value!;
        if (toMin(end) <= toMin(start)) {
          end = ALLDAY_END;
          notes.push(`Endzeit „${bis.raw}“ lag nicht nach dem Start → ${ALLDAY_END}`);
        }
      } else {
        end = hhmm(Math.min(toMin(ALLDAY_END), toMin(start) + DEFAULT_DURATION_MIN));
        notes.push(`Endzeit fehlte${bis.raw ? ` („${bis.raw}“)` : ''} → ${DEFAULT_DURATION_MIN / 60} h angenommen`);
      }
    } else {
      start = PLACEHOLDER_START; end = PLACEHOLDER_END;
      const hint = von.raw || bis.raw;
      notes.push(`keine Uhrzeit${hint ? ` („${hint}“)` : ''} → Platzhalter ${PLACEHOLDER_START}–${PLACEHOLDER_END}`);
    }

    rows.push({
      sheet: ws.name, excelRow: r, date: lastDate, title,
      contact: clean(cell(5)), note: clean(cell(6)), carrier: clean(cell(7)),
      start, end, allday, untilTail, notes,
    });
  }
  return { rows, skipped };
}

/* ---------------------------------------------------------------- Mehrtägiges zusammenfassen */

interface Booking {
  sheet: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  spanMode: 'SINGLE' | 'THROUGH';
  title: string;
  note: string | null;
  sources: string[];         // Excel-Zeilen, aus denen der Termin entstand
  notes: string[];
}

const nextDay = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return isoDate(x);
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-zäöüß0-9]+/g, '');

function buildNote(r: Row): string | null {
  const parts: string[] = [];
  if (r.note) parts.push(r.note);
  if (r.contact) parts.push(`Ansprechperson: ${r.contact}`);
  if (r.carrier) parts.push(`Träger: ${r.carrier}`);
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Läufe aufeinanderfolgender Tage mit gleichem Titel zu einem durchgehenden
 * Termin verschmelzen – aber nur, wenn die Zeilen ganztägig sind bzw. die letzte
 * eine „bis“-Fortsetzung ist. Reguläre getaktete Termine an zwei Tagen hintereinander
 * bleiben absichtlich getrennt, das sind eigene Sitzungen.
 */
function mergeRuns(rows: Row[]): Booking[] {
  const out: Booking[] = [];
  const byTitle = new Map<string, Row[]>();
  for (const r of rows) {
    const key = norm(r.title);
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key)!.push(r);
  }

  const merged = new Set<Row>();
  for (const list of byTitle.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i < list.length; i++) {
      const first = list[i];
      if (merged.has(first) || !(first.allday || first.untilTail)) continue;
      const run = [first];
      while (i + 1 < list.length) {
        const nxt = list[i + 1];
        if (nxt.date !== nextDay(run[run.length - 1].date)) break;
        if (!(nxt.allday || nxt.untilTail)) break;
        run.push(nxt); i++;
      }
      if (run.length < 2) continue;
      run.forEach((r) => merged.add(r));
      const last = run[run.length - 1];
      out.push({
        sheet: first.sheet,
        startDate: first.date, endDate: last.date,
        startTime: first.start, endTime: last.end,
        spanMode: 'THROUGH',
        title: first.title,
        note: buildNote(first),
        sources: run.map((r) => `${r.sheet}!${r.excelRow}`),
        notes: [
          `aus ${run.length} Zeilen zu einem durchgehenden Termin zusammengefasst`,
          ...run.flatMap((r) => r.notes),
        ],
      });
    }
  }

  for (const r of rows) {
    if (merged.has(r)) continue;
    out.push({
      sheet: r.sheet,
      startDate: r.date, endDate: r.date,
      startTime: r.start, endTime: r.end,
      spanMode: 'SINGLE',
      title: r.title,
      note: buildNote(r),
      sources: [`${r.sheet}!${r.excelRow}`],
      notes: r.notes,
    });
  }
  out.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime));
  return out;
}

/* ---------------------------------------------------------------- Raum-Zuordnung */

const strip = (s: string) =>
  s.toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');

/** Blattname „SAAL 26“ → Kern „saal“ */
function sheetKey(name: string) {
  return strip(name.replace(/\b(19|20)?\d{2}\b/g, ''));
}

function matchRoom(key: string, existing: { id: number; name: string }[]) {
  const cands = existing.map((r) => ({ ...r, k: strip(r.name) }));
  const exact = cands.find((r) => r.k === key);
  if (exact) return { room: exact, ambiguous: [] as string[] };
  const partial = cands.filter((r) => r.k.includes(key) || key.includes(r.k));
  if (!partial.length) return { room: null, ambiguous: [] as string[] };
  // Bei mehreren Treffern den kürzesten Namen nehmen und den Rest melden
  partial.sort((a, b) => a.name.length - b.name.length);
  return { room: partial[0], ambiguous: partial.slice(1).map((r) => r.name) };
}

const DEFAULT_COLOR: Record<string, string> = {
  saal: '#007AFF', rot: '#FF375F', blau: '#0A84FF',
  violett: '#AF52DE', purpur: '#5856D6',
};

/* ---------------------------------------------------------------- Vorprüfung */

/** Früh und mit klarer Meldung scheitern, statt später an einer SQL-Fehlermeldung */
async function preflight(client: postgres.Sql) {
  try {
    await client`select 1`;
  } catch (e) {
    throw new Error(
      'Die Datenbank ist nicht erreichbar. Connection-String, Netzverbindung und ' +
      'Firewall prüfen. Ursprüngliche Meldung: ' +
      (e instanceof Error && e.message ? e.message : String((e as { code?: string })?.code ?? e)),
    );
  }

  const [tbl] = await client<{ n: number }[]>`
    select count(*)::int as n from information_schema.tables
    where table_schema = 'public' and table_name = 'bookings'`;
  if (!tbl?.n) {
    throw new Error('Die Tabelle „bookings“ fehlt – die Migrationen sind noch nicht eingespielt. Erst ausführen: npm run db:migrate');
  }

  const [col] = await client<{ n: number }[]>`
    select count(*)::int as n from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'import_source'`;
  if (!col?.n) {
    throw new Error('Die Spalte „bookings.import_source“ fehlt – Migration 0001 ist noch nicht eingespielt. Erst ausführen: npm run db:migrate');
  }
}

/* ---------------------------------------------------------------- Hauptlauf */

async function main() {
  const { files, commit, createMissing, opt } = args();
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Weder DIRECT_DATABASE_URL noch DATABASE_URL ist gesetzt. ' +
      'Lege im Projektordner eine .env an (Vorlage: .env.example).',
    );
  }
  const which = process.env.DIRECT_DATABASE_URL ? 'DIRECT_DATABASE_URL' : 'DATABASE_URL';
  const { url: dsn, changed } = normalizeDatabaseUrl(url);
  console.log(`Verbindung über ${which} → ${maskUrl(dsn)}`);
  changed.forEach((c) => console.log(`  Hinweis: ${c}`));

  const client = postgres(dsn, { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 30 });
  const db = drizzle(client, { schema });

  try {
    await preflight(client);
    if (opt.undo) {
      const tag = opt.undo;
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
        .from(bookings).where(eq(bookings.importSource, tag));
      if (n === 0) {
        const tags = await db.select({ t: bookings.importSource, n: sql<number>`count(*)::int` })
          .from(bookings).groupBy(bookings.importSource);
        const known = tags.filter((t) => t.t).map((t) => `${t.t} (${t.n})`);
        console.log(`Keine Termine mit der Kennung „${tag}“ gefunden – es gibt nichts zurückzunehmen.`);
        console.log(known.length ? `Vorhandene Kennungen: ${known.join(', ')}` : 'Es ist bisher überhaupt kein Import erfolgt.');
        return;
      }
      if (!commit) {
        console.log(`Trockenlauf: ${n} Termine mit Kennung „${tag}“ würden gelöscht. Mit --commit ausführen.`);
        return;
      }
      await db.delete(bookings).where(eq(bookings.importSource, tag));
      console.log(`${n} Termine mit Kennung „${tag}“ gelöscht.`);
      return;
    }

    if (!files.length) throw new Error('Bitte mindestens eine Datei angeben: --file "<pfad.xlsx>"');

    const existingRooms = await db.select({ id: rooms.id, name: rooms.name })
      .from(rooms).orderBy(asc(rooms.id));
    const mapArg = new Map<string, string>();
    for (const pair of (opt.map ?? '').split(',').filter(Boolean)) {
      const [k, v] = pair.split('=');
      if (k && v) mapArg.set(strip(k), v.trim());
    }

    let createdBy: number | null = null;
    if (opt['created-by']) {
      const [u] = await db.select().from(users).where(eq(users.email, opt['created-by'].toLowerCase())).limit(1);
      if (!u) throw new Error(`Kein Konto mit der Adresse ${opt['created-by']}.`);
      createdBy = u.id;
    } else {
      const [u] = await db.select().from(users).where(eq(users.role, 'ADMIN')).orderBy(asc(users.id)).limit(1);
      createdBy = u?.id ?? null;
    }

    /* Dublettenschutz: identische Termine (Raum, Zeitraum, Titel) nur einmal.
       Die Jahresplaene ueberlappen sich am Jahreswechsel, und in den Blaettern
       selbst stehen einzelne Zeilen doppelt. */
    const seen = new Set<string>();
    const dupKey = (roomId: number, b: { startDate: string; endDate: string; startTime: string; endTime: string; title: string }) =>
      [roomId, b.startDate, b.endDate, b.startTime, b.endTime, norm(b.title)].join('|');
    for (const row of await db.select({
      roomId: bookings.roomId, startDate: bookings.startDate, endDate: bookings.endDate,
      startTime: bookings.startTime, endTime: bookings.endTime, title: bookings.title,
    }).from(bookings)) {
      seen.add(dupKey(row.roomId, {
        startDate: row.startDate, endDate: row.endDate,
        startTime: row.startTime.slice(0, 5), endTime: row.endTime.slice(0, 5), title: row.title,
      }));
    }

    const report: string[] = [];
    let grandTotal = 0;
    let grandDupes = 0;

    for (const file of files) {
      const year = basename(file).match(/(20\d{2})/)?.[1] ?? 'unbekannt';
      const tag = opt.tag ?? `belegungsplan-${year}`;

      console.log(`\n=== ${basename(file)}  (Kennung: ${tag}) ===`);
      report.push(`\n## ${basename(file)}\n\nKennung: \`${tag}\`\n`);

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(file);

      const [{ n: already }] = await db.select({ n: sql<number>`count(*)::int` })
        .from(bookings).where(eq(bookings.importSource, tag));
      if (already > 0) {
        console.log(`  Achtung: ${already} Termine mit dieser Kennung sind schon vorhanden.`);
        console.log(`  Erst zurücknehmen:  npm run import:plan -- --undo "${tag}" --commit`);
        if (commit) throw new Error('Abbruch – doppelter Import verhindert.');
      }

      for (const ws of wb.worksheets) {
        if (SKIP_SHEETS.includes(strip(ws.name).replace(/\d+/g, ''))) continue;

        const key = sheetKey(ws.name);
        const wanted = mapArg.get(key);
        let room: { id: number; name: string } | null;
        let ambiguous: string[] = [];
        if (wanted) {
          room = existingRooms.find((r) => strip(r.name) === strip(wanted)) ?? null;
          if (!room) throw new Error(`--map verweist auf „${wanted}“, aber es gibt keinen Raum mit diesem Namen.`);
        } else {
          const m = matchRoom(key, existingRooms);
          room = m.room; ambiguous = m.ambiguous;
        }

        const { rows, skipped } = readSheet(ws);
        if (!rows.length) { console.log(`  ${ws.name}: keine Termine`); continue; }

        if (!room) {
          if (!createMissing) {
            console.log(`  ${ws.name}: KEIN passender Raum gefunden (${rows.length} Termine übersprungen)`);
            report.push(`- **${ws.name}**: kein Raum zugeordnet, ${rows.length} Termine nicht importiert. ` +
              `Mit \`--map "${ws.name.split(' ')[0]}=<Raumname>"\` zuordnen oder \`--create-missing\` benutzen.`);
            continue;
          }
          const color = DEFAULT_COLOR[key] ?? '#8E8E93';
          if (commit) {
            const [grp] = await db.select().from(roomGroups).orderBy(asc(roomGroups.sortOrder)).limit(1);
            const [ins] = await db.insert(rooms)
              .values({ name: ws.name.split(' ')[0], color, capacity: 0, equipment: '', groupId: grp?.id ?? null })
              .returning({ id: rooms.id, name: rooms.name });
            room = ins; existingRooms.push(ins);
          } else {
            room = { id: -1, name: `${ws.name.split(' ')[0]} (neu)` };
          }
          console.log(`  ${ws.name}: Raum „${room.name}“ wird angelegt`);
        }

        if (ambiguous.length) {
          console.log(`  Hinweis: „${ws.name}“ passt auch auf ${ambiguous.join(', ')} – gewählt: ${room.name}`);
          report.push(`- Hinweis: **${ws.name}** hätte auch auf ${ambiguous.join(', ')} gepasst, ` +
            `gewählt wurde \`${room.name}\`. Mit \`--map\` festlegen, falls falsch.`);
        }

        const all = mergeRuns(rows);
        const list: typeof all = [];
        const dupes: typeof all = [];
        for (const b of all) {
          const k = dupKey(room.id, b);
          if (seen.has(k)) { dupes.push(b); continue; }
          seen.add(k);
          list.push(b);
        }
        grandDupes += dupes.length;

        const values = list.map((b) => ({
          roomId: room!.id,
          title: b.title,
          note: b.note,
          startDate: b.startDate,
          endDate: b.endDate,
          startTime: b.startTime,
          endTime: b.endTime,
          spanMode: b.spanMode,
          status: 'CONFIRMED' as const,
          attendees: 0,
          createdById: createdBy,
          decidedById: createdBy,
          decidedAt: new Date(),
          importSource: tag,
        }));

        const withNotes = list.filter((b) => b.notes.length);
        const mergedCount = list.filter((b) => b.spanMode === 'THROUGH').length;
        console.log(`  ${ws.name} → ${room.name}: ${list.length} Termine ` +
          `(${mergedCount} mehrtägig, ${withNotes.length} mit Anmerkung` +
          `${dupes.length ? `, ${dupes.length} Dubletten übersprungen` : ''}` +
          `${skipped ? `, ${skipped} ohne Datum verworfen` : ''})`);
        grandTotal += list.length;

        report.push(`\n### ${ws.name} → ${room.name}\n`);
        report.push(`${list.length} Termine, davon ${mergedCount} mehrtägig zusammengefasst.` +
          (dupes.length ? ` ${dupes.length} Dubletten übersprungen.` : '') +
          (skipped ? ` ${skipped} Zeilen ohne Datum verworfen.` : ''));
        if (dupes.length) {
          report.push(`\n**Übersprungene Dubletten** – identischer Termin war schon vorhanden:\n`);
          report.push(`| Datum | Zeit | Titel | Quelle |`);
          report.push(`|---|---|---|---|`);
          for (const b of dupes) {
            report.push(`| ${b.startDate}${b.endDate !== b.startDate ? ` → ${b.endDate}` : ''} | ` +
              `${b.startTime}–${b.endTime} | ${b.title.replace(/\|/g, '/')} | ${b.sources.join(', ')} |`);
          }
        }
        if (withNotes.length) {
          report.push(`\n| Datum | Zeit | Titel | Interpretation | Quelle |`);
          report.push(`|---|---|---|---|---|`);
          for (const b of withNotes) {
            const when = b.spanMode === 'THROUGH' ? `${b.startDate} → ${b.endDate}` : b.startDate;
            report.push(`| ${when} | ${b.startTime}–${b.endTime} | ${b.title.replace(/\|/g, '/')} | ` +
              `${b.notes.join('; ').replace(/\|/g, '/')} | ${b.sources.join(', ')} |`);
          }
        }

        if (commit && values.length) {
          for (let i = 0; i < values.length; i += 200) {
            await db.insert(bookings).values(values.slice(i, i + 200));
          }
        }
      }
    }

    const reportPath = opt.report ?? `import-report-${new Date().toISOString().slice(0, 10)}.md`;
    writeFileSync(reportPath,
      `# Importbericht Belegungsplan\n\nErzeugt: ${new Date().toLocaleString('de-DE')}\n` +
      `Modus: ${commit ? '**geschrieben**' : 'Trockenlauf, nichts geschrieben'}\n` +
      `Termine insgesamt: ${grandTotal}\n` +
      `Übersprungene Dubletten: ${grandDupes}\n` +
      report.join('\n') + '\n');

    console.log(`\nBericht: ${reportPath}`);
    const dupNote = grandDupes ? ` ${grandDupes} Dubletten übersprungen.` : '';
    console.log(commit
      ? `Fertig – ${grandTotal} Termine geschrieben.${dupNote}`
      : `Trockenlauf beendet – ${grandTotal} Termine würden geschrieben.${dupNote} Mit --commit ausführen.`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

/** Alles auspacken, was der Fehler hergibt – postgres.js und Drizzle
 *  verstecken die eigentliche Ursache gern in cause/detail/code. */
function explain(e: unknown, depth = 0): string {
  const pad = '  '.repeat(depth);
  if (e === null || e === undefined) return `${pad}(kein Fehlerobjekt)`;
  if (typeof e !== 'object') return `${pad}${String(e)}`;
  const o = e as Record<string, unknown> & { message?: string; stack?: string };
  const lines: string[] = [];
  const head = [o.constructor?.name, o.message || '(keine Meldung)'].filter(Boolean).join(': ');
  lines.push(`${pad}${head}`);
  for (const key of ['code', 'errno', 'severity', 'detail', 'hint', 'position', 'routine', 'table', 'column', 'constraint', 'address', 'port', 'query']) {
    const v = o[key];
    if (v !== undefined && v !== null && v !== '') lines.push(`${pad}  ${key}: ${String(v).slice(0, 300)}`);
  }
  if (o.cause) lines.push(`${pad}  Ursache:\n${explain(o.cause, depth + 2)}`);
  if (depth === 0 && typeof o.stack === 'string') {
    lines.push('', 'Stack:', o.stack.split('\n').slice(0, 6).join('\n'));
  }
  return lines.join('\n');
}

main().catch((e) => {
  console.error('\nImport fehlgeschlagen.\n');
  console.error(explain(e));
  console.error('\nHäufige Ursachen:');
  console.error('  · .env fehlt oder DATABASE_URL ist leer');
  console.error('  · Migrationen noch nicht eingespielt  →  npm run db:migrate');
  console.error('  · Datenbank nicht erreichbar (Netz, Firewall, falscher Connection-String)');
  process.exit(1);
});
