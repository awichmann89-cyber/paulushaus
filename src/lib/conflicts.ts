import { and, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm';
import { db, bookings } from '@/lib/db';
import { overlaps, rangeText, type Ev, type SpanMode } from '@/lib/calendar';

/* Bewusst KEINE Server Action: Konfliktinfos enthalten Titel fremder Termine und
   dürfen den Server nicht verlassen (siehe README). Aus einer 'use server'-Datei
   exportiert wären sie für jeden Browser aufrufbar. */

export type Conflict = { title: string; when: string };
export type Slot = {
  roomId: number; startDate: string; endDate: string;
  startTime: string; endTime: string; spanMode: SpanMode;
};

const asEv = (i: Slot): Ev => ({
  id: -1, roomId: i.roomId, title: '', note: null,
  startDate: i.startDate, endDate: i.endDate, startTime: i.startTime, endTime: i.endTime,
  spanMode: i.spanMode, status: 'CONFIRMED', attendees: 0,
  createdBy: null, createdById: null, updatedAt: '',
});

/**
 * Kollisionen mit bestätigten Terminen desselben Raums – tageweise geprüft.
 * Für Serien eine Abfrage über den ganzen Zeitraum statt einer je Termin.
 * `exclude` sind die Termine, die gerade selbst geändert werden.
 */
export async function conflictsFor(slots: Slot[], exclude: number[] = []): Promise<Conflict[]> {
  if (!slots.length) return [];
  const from = slots.reduce((m, s) => (s.startDate < m ? s.startDate : m), slots[0].startDate);
  const to = slots.reduce((m, s) => (s.endDate > m ? s.endDate : m), slots[0].endDate);
  const rows = await db.select().from(bookings).where(and(
    inArray(bookings.roomId, [...new Set(slots.map((s) => s.roomId))]),
    eq(bookings.status, 'CONFIRMED'),
    lte(bookings.startDate, to),
    gte(bookings.endDate, from),
    exclude.length ? notInArray(bookings.id, exclude) : sql`true`,
  ));
  const existing = rows.map((b) => ({
    id: b.id, roomId: b.roomId, title: b.title, note: b.note,
    startDate: b.startDate, endDate: b.endDate, startTime: b.startTime, endTime: b.endTime,
    spanMode: b.spanMode, status: b.status, attendees: b.attendees,
    createdBy: null, createdById: null, updatedAt: '',
  } as Ev));

  const out: Conflict[] = [];
  for (const s of slots) {
    const candidate = asEv(s);
    for (const e of existing) {
      if (e.roomId === s.roomId && e.startDate <= s.endDate && e.endDate >= s.startDate && overlaps(e, candidate))
        out.push({ title: e.title, when: rangeText(e) });
    }
  }
  return out;
}

export async function findConflicts(input: Slot & { id?: number }): Promise<Conflict[]> {
  return conflictsFor([input], input.id ? [input.id] : []);
}
