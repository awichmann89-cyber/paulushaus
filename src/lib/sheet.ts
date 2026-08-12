import { clock, DW, dowIdx, min, parseISO } from './dates';
import { daysOf, isMulti, type Ev } from './calendar';

export interface SheetRow {
  day: string;          // ISO
  ev: Ev;
  time: string;
  multi: boolean;
}

/** Zeilen der Druckliste: „täglich“-Termine je Tag, durchgehende als eine Zeile */
export function sheetRows(events: Ev[], month: string): SheetRow[] {
  const out: SheetRow[] = [];
  for (const e of events) {
    if (isMulti(e) && e.spanMode === 'DAILY') {
      for (const d of daysOf(e)) {
        if (d.startsWith(month)) out.push({ day: d, ev: e, time: `${clock(e.startTime)} – ${clock(e.endTime)}`, multi: false });
      }
    } else if (isMulti(e)) {
      const z = parseISO(e.endDate);
      out.push({
        day: e.startDate, ev: e, multi: true,
        time: `${clock(e.startTime)} → ${String(z.getDate()).padStart(2, '0')}.${String(z.getMonth() + 1).padStart(2, '0')}. ${clock(e.endTime)}`,
      });
    } else {
      out.push({ day: e.startDate, ev: e, time: `${clock(e.startTime)} – ${clock(e.endTime)}`, multi: false });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || min(clock(a.ev.startTime)) - min(clock(b.ev.startTime)));
}

export function dayLabel(isoDay: string): string {
  const d = parseISO(isoDay);
  return `${DW[dowIdx(d)]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}
