import { and, asc, eq, gte, lte, ne, sql, inArray } from 'drizzle-orm';
import { db, rooms, roomGroups, bookings, bookingSeries, users, roomExports } from './db';
import type { Ev, RoomView, GroupView } from './calendar';
import { addDays, iso, parseISO, startOfWeek } from './dates';
import { describe, type MonthlyMode } from './recurrence';

export async function getRooms(onlyPublic = false): Promise<RoomView[]> {
  const rows = await db
    .select({
      id: rooms.id, name: rooms.name, color: rooms.color, capacity: rooms.capacity,
      equipment: rooms.equipment, groupId: rooms.groupId, isPublic: rooms.isPublic, planSheet: rooms.planSheet,
      sortOrder: rooms.sortOrder, groupName: roomGroups.name, groupSort: roomGroups.sortOrder,
    })
    .from(rooms)
    .leftJoin(roomGroups, eq(rooms.groupId, roomGroups.id))
    .where(eq(rooms.isActive, true))
    .orderBy(asc(roomGroups.sortOrder), asc(rooms.sortOrder), asc(rooms.name));

  return rows
    .filter((r) => !onlyPublic || r.isPublic)
    .map((r) => ({
      id: r.id, name: r.name, color: r.color, capacity: r.capacity, equipment: r.equipment,
      groupId: r.groupId, groupName: r.groupName ?? 'Ohne Gruppe', isPublic: r.isPublic,
      planSheet: r.planSheet,
    }));
}

export async function getGroups(): Promise<{ id: number; name: string; sortOrder: number }[]> {
  return db.select().from(roomGroups).orderBy(asc(roomGroups.sortOrder), asc(roomGroups.name));
}

/** Räume nach Gruppen gebündelt, leere Gruppen fallen weg */
export function groupRooms(list: RoomView[]): GroupView[] {
  const out: GroupView[] = [];
  for (const r of list) {
    const key = r.groupId ?? -1;
    let g = out.find((x) => x.id === key);
    if (!g) { g = { id: key, name: r.groupName, rooms: [] }; out.push(g); }
    g.rooms.push(r);
  }
  return out;
}

type SeriesRow = typeof bookingSeries.$inferSelect;

export const seriesText = (s: SeriesRow) => describe({
  freq: s.freq, interval: s.interval,
  weekdays: s.weekdays ? s.weekdays.split(',').map(Number) : undefined,
  monthly: (s.monthlyMode ?? undefined) as MonthlyMode | undefined,
  until: s.untilDate, count: s.count,
}, s.anchorDate);

const toEv = (b: typeof bookings.$inferSelect, name: string | null, s?: SeriesRow | null): Ev => ({
  id: b.id, roomId: b.roomId, title: b.title, note: b.note,
  startDate: b.startDate, endDate: b.endDate,
  startTime: b.startTime, endTime: b.endTime,
  spanMode: b.spanMode, status: b.status, attendees: b.attendees,
  createdBy: name, createdById: b.createdById,
  updatedAt: b.updatedAt.toISOString(),
  seriesId: b.seriesId, seriesText: s ? seriesText(s) : null,
});

/** Termine samt Ersteller und Serienregel */
const withMeta = () => db
  .select({ b: bookings, name: users.name, s: bookingSeries })
  .from(bookings)
  .leftJoin(users, eq(bookings.createdById, users.id))
  .leftJoin(bookingSeries, eq(bookings.seriesId, bookingSeries.id));

/** Alle Termine, die den Zeitraum berühren – inklusive mehrtägiger, die hineinragen */
export async function getBookings(from: string, to: string, opts?: { confirmedOnly?: boolean }): Promise<Ev[]> {
  const conds = [lte(bookings.startDate, to), gte(bookings.endDate, from), ne(bookings.status, 'REJECTED'), ne(bookings.status, 'CANCELLED')];
  if (opts?.confirmedOnly) conds.push(eq(bookings.status, 'CONFIRMED'));
  const rows = await withMeta()
    .where(and(...conds))
    .orderBy(asc(bookings.startDate), asc(bookings.startTime));
  return rows.map((r) => toEv(r.b, r.name, r.s));
}

/** Sichtbarer Zeitraum je Ansicht – großzügig, damit Nachbarwochen mitkommen */
export function rangeFor(view: string, cursor: Date): { from: string; to: string } {
  if (view === 'month') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    return { from: iso(start), to: iso(addDays(start, 41)) };
  }
  if (view === 'day' || view === 'rooms') return { from: iso(cursor), to: iso(cursor) };
  const a = startOfWeek(cursor);
  return { from: iso(a), to: iso(addDays(a, 6)) };
}

export async function getPendingCount(userId?: number): Promise<number> {
  const conds = [eq(bookings.status, 'PENDING')];
  if (userId) conds.push(eq(bookings.createdById, userId));
  // Eine Serienanfrage zählt als eine Anfrage, nicht als 52
  const [row] = await db
    .select({ n: sql<number>`count(distinct coalesce(-${bookings.seriesId}, ${bookings.id}))::int` })
    .from(bookings).where(and(...conds));
  return row?.n ?? 0;
}

export async function getRequests(userId?: number): Promise<Ev[]> {
  const conds = [eq(bookings.status, 'PENDING')];
  if (userId) conds.push(eq(bookings.createdById, userId));
  const rows = await withMeta()
    .where(and(...conds))
    .orderBy(asc(bookings.startDate), asc(bookings.startTime));
  return rows.map((r) => toEv(r.b, r.name, r.s));
}

/** Bestätigte Termine eines Raums, die den Monat berühren */
export async function getMonthBookings(roomId: number, month: string): Promise<Ev[]> {
  const from = `${month}-01`;
  const first = parseISO(from);
  const to = iso(new Date(first.getFullYear(), first.getMonth() + 1, 0));
  const rows = await withMeta()
    .where(and(
      eq(bookings.roomId, roomId), eq(bookings.status, 'CONFIRMED'),
      lte(bookings.startDate, to), gte(bookings.endDate, from),
    ))
    .orderBy(asc(bookings.startDate), asc(bookings.startTime));
  return rows.map((r) => toEv(r.b, r.name, r.s));
}

export interface ExportRow {
  room: RoomView;
  count: number;
  exportedAt: Date | null;
  changes: { title: string; startDate: string; startTime: string; deleted: boolean }[] | null;
}

/** Exportstatus je Raum für einen Monat: nie exportiert (null) / aktuell / n Änderungen */
export async function getExportStatus(month: string): Promise<ExportRow[]> {
  const list = await getRooms();
  if (!list.length) return [];
  const from = `${month}-01`;
  const first = parseISO(from);
  const to = iso(new Date(first.getFullYear(), first.getMonth() + 1, 0));

  const exps = await db.select().from(roomExports).where(eq(roomExports.month, month));
  const rows = await db
    .select({
      roomId: bookings.roomId, title: bookings.title, startDate: bookings.startDate,
      startTime: bookings.startTime, status: bookings.status, updatedAt: bookings.updatedAt,
    })
    .from(bookings)
    .where(and(
      inArray(bookings.roomId, list.map((r) => r.id)),
      inArray(bookings.status, ['CONFIRMED', 'CANCELLED']),
      lte(bookings.startDate, to), gte(bookings.endDate, from),
    ));

  return list.map((room) => {
    const mine = rows.filter((r) => r.roomId === room.id);
    const exp = exps.find((e) => e.roomId === room.id) ?? null;
    const count = mine.filter((r) => r.status === 'CONFIRMED').length;
    if (!exp) return { room, count, exportedAt: null, changes: null };
    const changes = mine
      .filter((r) => r.updatedAt > exp.exportedAt)
      .map((r) => ({
        title: r.title, startDate: r.startDate, startTime: r.startTime,
        deleted: r.status === 'CANCELLED',
      }));
    return { room, count, exportedAt: exp.exportedAt, changes };
  });
}

export async function getUsers() {
  return db.select().from(users).orderBy(asc(users.name));
}
