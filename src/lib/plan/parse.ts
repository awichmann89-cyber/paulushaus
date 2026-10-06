/**
 * Lesen der Excel-Belegungspläne (SAAL / ROT / BLAU / VIOLETT / PURPUR).
 *
 * Reine Funktionen ohne Datenbank – benutzt vom Import in der App
 * (src/lib/plan/import.ts) und vom Kommandozeilen-Skript
 * (scripts/import-belegungsplan.ts). Deshalb hier keine „@/“-Importe.
 */
import ExcelJS from 'exceljs';

/* ---------------------------------------------------------------- Konventionen */

/** „ganztägig“ füllt genau das Zeitraster der App (siehe src/lib/dates.ts) */
export const ALLDAY_START = '07:00';
export const ALLDAY_END = '23:00';
/** Zeilen ohne jede Uhrzeit werden zu einem einstündigen Platzhalter */
export const PLACEHOLDER_START = '09:00';
export const PLACEHOLDER_END = '10:00';
/** Fehlt die Endzeit bei gesetzter Startzeit */
export const DEFAULT_DURATION_MIN = 120;
/** Diese Blätter enthalten keine Belegung */
export const SKIP_SHEETS = ['kontakte', 'bastelstube', 'ts'];

export const DEFAULT_COLOR: Record<string, string> = {
  saal: '#007AFF', rot: '#FF375F', blau: '#0A84FF',
  violett: '#AF52DE', purpur: '#5856D6',
};

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
export function cellText(v: unknown): string {
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

export interface Row {
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

export function isoDate(d: Date) {
  // Excel-Daten kommen als UTC-Mitternacht – Zeitzone darf den Tag nicht verschieben
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function readSheet(ws: ExcelJS.Worksheet): { rows: Row[]; skipped: number } {
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

    if (von.kind === 'time' && bis.kind === 'allday') {
      // „18:00 | ganztägig“: Beginn eines durchgehenden Termins – so schreibt ihn auch der Export
      allday = true;
      start = von.value!; end = ALLDAY_END;
      notes.push(`„${von.value} bis ganztägig“ → ${von.value}–${ALLDAY_END}, Beginn eines mehrtägigen Termins`);
    } else if (von.kind === 'allday' || bis.kind === 'allday') {
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

export interface Booking {
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
export const norm = (s: string) => s.toLowerCase().replace(/[^a-zäöüß0-9]+/g, '');

const CONTACT = 'Ansprechperson: ';
const CARRIER = 'Träger: ';

function buildNote(r: Row): string | null {
  const parts: string[] = [];
  if (r.note) parts.push(r.note);
  if (r.contact) parts.push(`${CONTACT}${r.contact}`);
  if (r.carrier) parts.push(`${CARRIER}${r.carrier}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Umkehrung von buildNote – der Export verteilt die Notiz wieder auf die drei Spalten */
export function splitNote(note: string | null): { note: string; contact: string; carrier: string } {
  const out = { note: [] as string[], contact: '', carrier: '' };
  for (const p of (note ?? '').split(' · ')) {
    if (p.startsWith(CONTACT) && !out.contact) out.contact = p.slice(CONTACT.length);
    else if (p.startsWith(CARRIER) && !out.carrier) out.carrier = p.slice(CARRIER.length);
    else if (p.trim()) out.note.push(p);
  }
  return { note: out.note.join(' · '), contact: out.contact, carrier: out.carrier };
}

/**
 * Läufe aufeinanderfolgender Tage mit gleichem Titel zu einem durchgehenden
 * Termin verschmelzen – aber nur, wenn die Zeilen ganztägig sind bzw. die letzte
 * eine „bis“-Fortsetzung ist. Reguläre getaktete Termine an zwei Tagen hintereinander
 * bleiben absichtlich getrennt, das sind eigene Sitzungen.
 */
export function mergeRuns(rows: Row[]): Booking[] {
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

export const strip = (s: string) =>
  s.toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');

/** Blattname „SAAL 26“ → „SAAL“ – so steht er als Zuordnung am Raum */
export const sheetLabel = (name: string) =>
  name.replace(/\b(19|20)?\d{2}\b/g, '').replace(/\s+/g, ' ').trim() || name.trim();

/** Blattname „SAAL 26“ → Kern „saal“ */
export const sheetKey = (name: string) => strip(sheetLabel(name));

export const isSkippedSheet = (name: string) => SKIP_SHEETS.includes(strip(name).replace(/\d+/g, ''));

/**
 * Zuerst die gespeicherte Zuordnung (rooms.plan_sheet), dann ein Namensvergleich
 * ohne Umlaute und Sonderzeichen: „ROT 26“ findet „Roter Raum“.
 */
export function matchRoom<R extends { id: number; name: string; planSheet?: string | null }>(key: string, existing: R[]) {
  const fixed = existing.find((r) => r.planSheet && strip(r.planSheet) === key);
  if (fixed) return { room: fixed, ambiguous: [] as string[] };
  const cands = existing.map((r) => ({ r, k: strip(r.name) }));
  const exact = cands.find((c) => c.k === key);
  if (exact) return { room: exact.r, ambiguous: [] as string[] };
  const partial = cands.filter((c) => c.k.includes(key) || key.includes(c.k));
  if (!partial.length) return { room: null, ambiguous: [] as string[] };
  // Bei mehreren Treffern den kürzesten Namen nehmen und den Rest melden
  partial.sort((a, b) => a.r.name.length - b.r.name.length);
  return { room: partial[0].r, ambiguous: partial.slice(1).map((c) => c.r.name) };
}

/* ---------------------------------------------------------------- Dubletten */

export type DupSlot = { startDate: string; endDate: string; startTime: string; endTime: string; title: string };

/** Identischer Raum, Zeitraum und Titel gilt als derselbe Termin */
export const dupKey = (roomId: number, b: DupSlot) =>
  [roomId, b.startDate, b.endDate, b.startTime.slice(0, 5), b.endTime.slice(0, 5), norm(b.title)].join('|');

/** Jahr des Plans: das häufigste Jahr unter den Terminen, sonst aus dem Dateinamen */
export function planYear(bookings: { startDate: string }[], fileName: string): number | null {
  const count = new Map<number, number>();
  for (const b of bookings) {
    const y = Number(b.startDate.slice(0, 4));
    count.set(y, (count.get(y) ?? 0) + 1);
  }
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  const m = fileName.match(/(20\d{2})/);
  return m ? Number(m[1]) : null;
}
