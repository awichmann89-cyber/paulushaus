import { getMonthBookings, getRooms } from './data';
import { dayLabel, sheetRows } from './sheet';
import { MON } from './dates';

/** Eine Zeile der Monatsliste, fertig formatiert für Druckansicht und PDF */
export interface PrintRow {
  day: string;
  dayText: string;
  time: string;
  title: string;
  multi: boolean;
  daily: boolean;
  contact: string;
}

export interface PrintSheet {
  id: number;
  name: string;
  color: string;
  sub: string;          // „Belegungsplan Mai 2026 · Erdgeschoss · 80 Plätze“
  count: number;
  rows: PrintRow[];
}

export const monthName = (month: string) => `${MON[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** Monatslisten der gewählten Räume; ohne Auswahl alle */
export async function getPrintSheets(month: string, roomIds: number[]): Promise<PrintSheet[]> {
  const all = await getRooms();
  const chosen = roomIds.length ? all.filter((r) => roomIds.includes(r.id)) : all;
  return Promise.all(chosen.map(async (room) => {
    const events = await getMonthBookings(room.id, month);
    return {
      id: room.id, name: room.name, color: room.color, count: events.length,
      sub: `Belegungsplan ${monthName(month)} · ${room.groupName} · ${room.capacity} Plätze`,
      rows: sheetRows(events, month).map((r) => ({
        day: r.day, dayText: dayLabel(r.day), time: r.time, title: r.ev.title,
        multi: r.multi, daily: !r.multi && r.ev.spanMode === 'DAILY', contact: r.ev.contactShort ?? '',
      })),
    };
  }));
}

/** ?month=2026-05&rooms=1,2 lesen – gemeinsam für Druckansicht und PDF */
export function printParams(month?: string | null, rooms?: string | null) {
  return {
    month: /^\d{4}-\d{2}$/.test(month ?? '') ? month! : new Date().toISOString().slice(0, 7),
    roomIds: (rooms ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0),
  };
}
