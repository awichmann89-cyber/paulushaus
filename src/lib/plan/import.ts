import ExcelJS from 'exceljs';
import { and, asc, eq, inArray, isNotNull, isNull, ne, notExists, notInArray, or, sql } from 'drizzle-orm';
import { db, bookings, bookingSeries, carriers, rooms, users } from '@/lib/db';
import type { Recurrence } from '@/lib/recurrence';
import {
  dupKey, fullNote, isSkippedSheet, looksLikeShort, matchPerson, matchRoom, mergeRuns, planYear,
  readSheet, sheetKey, sheetLabel, type Booking,
} from './parse';
import { detectSeries } from './series';

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
  /** erkannte regelmäßige Termine */
  series: { title: string; time: string; text: string; count: number; missed: number }[];
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
  /** Träger aus der Datei, die es in der App noch nicht gibt – sie werden angelegt */
  newCarriers: string[];
  /** Ansprechpersonen, die keiner Person entsprechen – sie werden als Kontakt ohne Zugang angelegt */
  newContacts: string[];
  /** Ansprechpersonen, die auf mehrere Personen passen – sie bleiben als Text in der Notiz */
  ambiguousContacts: string[];
}

/** carrier und newContact: Namen aus der Datei, beim Schreiben in IDs übersetzt;
 *  seriesIdx zeigt auf die erkannte Serie in `series` */
export interface Analysis extends ImportPreview {
  values: (typeof bookings.$inferInsert & { carrier: string; newContact: string; seriesIdx: number | null })[];
  series: { rule: Recurrence; anchor: string }[];
}

const key = (name: string) => name.trim().toLowerCase();
const sorted = (m: Map<string, string>) => [...m.values()].sort((x, y) => x.localeCompare(y, 'de'));

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

  // Auch archivierte Träger zählen als bekannt – sonst entstünde eine Dublette
  const known = new Set((await db.select({ name: carriers.name }).from(carriers)).map((c) => key(c.name)));
  const newCarriers = new Map<string, string>();
  const people = await db.select({ id: users.id, name: users.name, short: users.short }).from(users);
  const newContacts = new Map<string, string>();
  const ambiguousContacts = new Map<string, string>();

  const out: SheetPreview[] = [];
  const values: Analysis['values'] = [];
  const series: Analysis['series'] = [];
  const now = new Date();

  for (const s of parsed) {
    const sk = sheetKey(s.ws.name);
    let roomId: number | null;
    let ambiguous: string[] = [];
    if (mapping && s.ws.name in mapping) {
      roomId = mapping[s.ws.name] || null;
      if (roomId && !allRooms.some((r) => r.id === roomId)) throw new Error(`Unbekannter Raum für Blatt „${s.ws.name}“.`);
    } else {
      const m = matchRoom(sk, allRooms);
      roomId = m.room?.id ?? null; ambiguous = m.ambiguous;
    }

    let list: Booking[] = s.bookings, dupes = 0;
    let found: ReturnType<typeof detectSeries> = [];
    if (roomId) {
      list = [];
      for (const b of s.bookings) {
        const k = dupKey(roomId, b);
        if (seen.has(k)) { dupes++; continue; }
        seen.add(k);
        list.push(b);
      }
      // Serien erkennen und jedem Termin seine Serie mitgeben
      found = detectSeries(list);
      const seriesOf = new Map<number, number>();
      for (const f of found) {
        for (const m of f.members) seriesOf.set(m, series.length);
        series.push({ rule: f.rule, anchor: f.anchor });
      }

      for (const [i, b] of list.entries()) {
        const ck = key(b.carrier);
        if (ck && !known.has(ck) && !newCarriers.has(ck)) newCarriers.set(ck, b.carrier);

        const person = b.contact ? matchPerson(b.contact, people) : null;
        if (person === 'ambiguous') ambiguousContacts.set(key(b.contact), b.contact);
        else if (b.contact && !person && !newContacts.has(key(b.contact))) newContacts.set(key(b.contact), b.contact);

        values.push({
          roomId, title: b.title,
          note: person === 'ambiguous' ? fullNote(b.note, b.contact) : b.note,
          contactId: typeof person === 'number' ? person : null,
          newContact: b.contact && person === null ? b.contact : '',
          carrier: b.carrier,
          seriesIdx: seriesOf.get(i) ?? null,
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
      series: found.map((f) => {
        const first = list[f.members[0]];
        return {
          title: first.title, time: `${first.startTime}–${first.endTime}`,
          text: f.text, count: f.members.length, missed: f.missed,
        };
      }).sort((x, y) => x.title.localeCompare(y.title, 'de')),
    });
  }

  return {
    fileName, year, tag, sheets: out,
    total: values.length,
    replaces: prev?.n ?? 0,
    editedSinceImport: prev?.edited ?? 0,
    newCarriers: sorted(newCarriers),
    newContacts: sorted(newContacts),
    ambiguousContacts: sorted(ambiguousContacts),
    values,
    series,
  };
}

/**
 * Ersetzt den vorigen Import desselben Jahres in einem Rutsch: löscht alle Termine
 * mit der Kennung und schreibt die neuen. Von Hand angelegte Termine bleiben unberührt.
 * Die gewählte Blatt-Zuordnung wird an den Räumen gespeichert.
 */
export async function applyPlan(a: Analysis, userId: number, opts: { series: boolean }) {
  const mapped = a.sheets.filter((s) => s.roomId);
  let seriesWritten = 0;
  await db.transaction(async (tx) => {
    // Serien des vorigen Imports mit entfernen, sofern kein anderer Termin mehr dazugehört
    const oldSeries = (await tx.selectDistinct({ id: bookings.seriesId }).from(bookings)
      .where(and(eq(bookings.importSource, a.tag), isNotNull(bookings.seriesId)))).map((r) => r.id!);
    await tx.delete(bookings).where(eq(bookings.importSource, a.tag));
    if (oldSeries.length) {
      await tx.delete(bookingSeries).where(and(
        inArray(bookingSeries.id, oldSeries),
        notExists(tx.select({ x: sql`1` }).from(bookings).where(eq(bookings.seriesId, bookingSeries.id))),
      ));
    }

    const seriesIds: number[] = [];
    if (opts.series) {
      for (const { rule: r, anchor } of a.series) {
        const [row] = await tx.insert(bookingSeries).values({
          freq: r.freq, interval: r.interval,
          weekdays: r.freq === 'WEEKLY' && r.weekdays?.length ? r.weekdays.join(',') : null,
          monthlyMode: r.freq === 'MONTHLY' ? r.monthly ?? 'DAY' : null,
          anchorDate: anchor, untilDate: r.until ?? null, count: null,
        }).returning({ id: bookingSeries.id });
        seriesIds.push(row.id);
      }
      seriesWritten = seriesIds.length;
    }

    // Fehlende Träger anlegen, dann alle Namen in IDs übersetzen
    const ids = new Map<string, number>();
    for (const c of await tx.select({ id: carriers.id, name: carriers.name }).from(carriers)) {
      if (!ids.has(key(c.name))) ids.set(key(c.name), c.id);
    }
    for (const name of a.newCarriers) {
      if (ids.has(key(name))) continue;
      const [c] = await tx.insert(carriers).values({ name }).returning({ id: carriers.id });
      ids.set(key(name), c.id);
    }

    // Unbekannte Ansprechpersonen als Kontakt ohne Zugang anlegen. „MS“ wird zugleich das
    // Kürzel – so trifft der nächste Import die Person auch nach dem Ergänzen des vollen Namens.
    const people = await tx.select({ id: users.id, name: users.name, short: users.short }).from(users);
    const contactIds = new Map<string, number>();
    for (const name of a.newContacts) {
      const found = matchPerson(name, people);
      if (typeof found === 'number') { contactIds.set(key(name), found); continue; }
      const [u] = await tx.insert(users).values({
        name, short: looksLikeShort(name) ? name : null, status: 'CONTACT',
      }).returning({ id: users.id });
      contactIds.set(key(name), u.id);
    }

    const rows = a.values.map(({ carrier, newContact, seriesIdx, ...v }) => ({
      ...v,
      seriesId: seriesIdx !== null ? seriesIds[seriesIdx] ?? null : null,
      contactId: v.contactId ?? (newContact ? contactIds.get(key(newContact)) ?? null : null),
      carrierId: carrier ? ids.get(key(carrier)) ?? null : null,
      createdById: userId, decidedById: userId,
    }));
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
  return { written: a.total, removed: a.replaces, rooms: mapped.length, series: seriesWritten };
}

