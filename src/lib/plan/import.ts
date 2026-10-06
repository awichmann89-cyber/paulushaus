import ExcelJS from 'exceljs';
import { and, asc, eq, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import { db, bookings, rooms } from '@/lib/db';
import {
  dupKey, isSkippedSheet, matchRoom, mergeRuns, planYear, readSheet, sheetKey, sheetLabel,
  type Booking,
} from './parse';

/** Blattname → Raum-ID; 0 heißt „nicht importieren“ */
export type SheetMapping = Record<string, number>;

export interface SheetPreview {
  sheet: string;
  label: string;                  // „SAAL“ – wird als Zuordnung am Raum gespeichert
  roomId: number | null;
  ambiguous: string[];
  count: number;                  // Termine, die geschrieben werden
  through: number;                // davon mehrtägig zusammengefasst
  dupes: number;
  skipped: number;                // Zeilen ohne Datum
  notes: { when: string; time: string; title: string; text: string; source: string }[];
}

export interface ImportPreview {
  fileName: string;
  year: number;
  tag: string;
  sheets: SheetPreview[];
  total: number;
  /** Termine des vorigen Imports mit derselben Kennung – sie werden ersetzt */
  replaces: number;
  /** davon nach dem Import in der App geändert oder abgesagt */
  editedSinceImport: number;
}

interface Analysis extends ImportPreview { values: (typeof bookings.$inferInsert)[] }

export const tagFor = (year: number) => `belegungsplan-${year}`;

export async function analyzePlan(file: ArrayBuffer, fileName: string, mapping?: SheetMapping): Promise<Analysis> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file);
  } catch {
    throw new Error('Die Datei lässt sich nicht als Excel-Arbeitsmappe (.xlsx) lesen.');
  }

  const sheets = wb.worksheets
    .filter((ws) => !isSkippedSheet(ws.name))
    .map((ws) => ({ ws, ...readSheet(ws) }))
    .filter((s) => s.rows.length);
  if (!sheets.length) {
    throw new Error('Keine Termine gefunden. Erwartet werden Blätter mit einer Spalte „Datum“ in der ersten Zeile.');
  }

  const parsed = sheets.map((s) => ({ ...s, bookings: mergeRuns(s.rows) }));
  const year = planYear(parsed.flatMap((s) => s.bookings), fileName);
  if (!year) throw new Error('Das Jahr des Plans lässt sich nicht bestimmen.');
  const tag = tagFor(year);

  const allRooms = await db.select({ id: rooms.id, name: rooms.name, planSheet: rooms.planSheet })
    .from(rooms).where(eq(rooms.isActive, true)).orderBy(asc(rooms.sortOrder), asc(rooms.name));

  /* Dublettenschutz gegen alles, was nach dem Ersetzen übrig bleibt: von Hand
     angelegte Termine und andere Importe (die Jahrespläne überlappen sich am
     Jahreswechsel). Abgesagte und abgelehnte Termine zählen nicht. */
  const seen = new Set<string>();
  const keep = await db.select({
    roomId: bookings.roomId, startDate: bookings.startDate, endDate: bookings.endDate,
    startTime: bookings.startTime, endTime: bookings.endTime, title: bookings.title,
  }).from(bookings).where(and(
    or(isNull(bookings.importSource), ne(bookings.importSource, tag)),
    notInArray(bookings.status, ['CANCELLED', 'REJECTED']),
  ));
  for (const b of keep) seen.add(dupKey(b.roomId, b));

  const [prev] = await db.select({
    n: sql<number>`count(*)::int`,
    edited: sql<number>`count(*) filter (where ${bookings.updatedAt} > ${bookings.createdAt} + interval '1 minute')::int`,
  }).from(bookings).where(eq(bookings.importSource, tag));

  const out: SheetPreview[] = [];
  const values: Analysis['values'] = [];
  const now = new Date();

  for (const s of parsed) {
    const key = sheetKey(s.ws.name);
    let roomId: number | null;
    let ambiguous: string[] = [];
    if (mapping && s.ws.name in mapping) {
      roomId = mapping[s.ws.name] || null;
      if (roomId && !allRooms.some((r) => r.id === roomId)) throw new Error(`Unbekannter Raum für Blatt „${s.ws.name}“.`);
    } else {
      const m = matchRoom(key, allRooms);
      roomId = m.room?.id ?? null; ambiguous = m.ambiguous;
    }

    let list: Booking[] = s.bookings, dupes = 0;
    if (roomId) {
      list = [];
      for (const b of s.bookings) {
        const k = dupKey(roomId, b);
        if (seen.has(k)) { dupes++; continue; }
        seen.add(k);
        list.push(b);
      }
      for (const b of list) {
        values.push({
          roomId, title: b.title, note: b.note,
          startDate: b.startDate, endDate: b.endDate, startTime: b.startTime, endTime: b.endTime,
          spanMode: b.spanMode, status: 'CONFIRMED', attendees: 0,
          decidedAt: now, importSource: tag,
        });
      }
    }

    out.push({
      sheet: s.ws.name, label: sheetLabel(s.ws.name), roomId, ambiguous,
      count: list.length,
      through: list.filter((b) => b.spanMode === 'THROUGH').length,
      dupes, skipped: s.skipped,
      notes: list.filter((b) => b.notes.length).map((b) => ({
        when: b.endDate !== b.startDate ? `${b.startDate} → ${b.endDate}` : b.startDate,
        time: `${b.startTime}–${b.endTime}`,
        title: b.title,
        text: b.notes.join('; '),
        source: b.sources.join(', '),
      })),
    });
  }

  return {
    fileName, year, tag, sheets: out,
    total: values.length,
    replaces: prev?.n ?? 0,
    editedSinceImport: prev?.edited ?? 0,
    values,
  };
}

/**
 * Ersetzt den vorigen Import desselben Jahres in einem Rutsch: löscht alle Termine
 * mit der Kennung und schreibt die neuen. Von Hand angelegte Termine bleiben unberührt.
 * Die gewählte Blatt-Zuordnung wird an den Räumen gespeichert.
 */
export async function applyPlan(a: Analysis, userId: number) {
  const mapped = a.sheets.filter((s) => s.roomId);
  await db.transaction(async (tx) => {
    await tx.delete(bookings).where(eq(bookings.importSource, a.tag));
    const rows = a.values.map((v) => ({ ...v, createdById: userId, decidedById: userId }));
    for (let i = 0; i < rows.length; i += 200) {
      await tx.insert(bookings).values(rows.slice(i, i + 200));
    }

    for (const s of mapped) {
      // Ein Blattname gehört genau einem Raum
      await tx.update(rooms).set({ planSheet: null })
        .where(and(sql`lower(${rooms.planSheet}) = lower(${s.label})`, ne(rooms.id, s.roomId!)));
      await tx.update(rooms).set({ planSheet: s.label }).where(eq(rooms.id, s.roomId!));
    }
  });
  return { written: a.total, removed: a.replaces, rooms: mapped.length };
}

