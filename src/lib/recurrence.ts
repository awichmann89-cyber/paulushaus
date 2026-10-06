import { addDays, dowIdx, iso, parseISO, startOfWeek, DW, DWL } from './dates';

export type RecurFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
/** DAY = am 15., NTH = am 2. Dienstag, LAST = am letzten Dienstag */
export type MonthlyMode = 'DAY' | 'NTH' | 'LAST';

export interface Recurrence {
  freq: RecurFreq;
  interval: number;
  /** nur WEEKLY: 0 = Montag … 6 = Sonntag */
  weekdays?: number[];
  /** nur MONTHLY */
  monthly?: MonthlyMode;
  /** letzter möglicher Tag, inklusive */
  until?: string | null;
  /** Anzahl der Termine */
  count?: number | null;
}

/** Obergrenze, damit ein Tippfehler („täglich, ohne Ende“) nicht tausende Zeilen erzeugt */
export const MAX_OCCURRENCES = 400;
/** Serien ohne Ende werden so weit im Voraus angelegt */
export const OPEN_END_YEARS = 2;

const sameMonthDay = (y: number, m: number, d: number) => {
  const x = new Date(y, m, d);
  return x.getMonth() === ((m % 12) + 12) % 12 ? x : null;   // 31. im April gibt es nicht
};

/** n-ter Wochentag im Monat (1 = erster), -1 = letzter */
function nthWeekday(y: number, m: number, wd: number, n: number): Date | null {
  if (n === -1) {
    const last = new Date(y, m + 1, 0);
    return addDays(last, -((dowIdx(last) - wd + 7) % 7));
  }
  const first = new Date(y, m, 1);
  const d = addDays(first, ((wd - dowIdx(first) + 7) % 7) + (n - 1) * 7);
  return d.getMonth() === first.getMonth() ? d : null;
}

export const nthOf = (d: Date) => Math.ceil(d.getDate() / 7);
export const isLastOfMonth = (d: Date) => addDays(d, 7).getMonth() !== d.getMonth();

/**
 * Alle Starttage einer Serie ab `start` (inklusive, sofern er zur Regel passt).
 * `truncated` heißt: die Regel hätte mehr Termine ergeben, als angelegt werden.
 */
export function occurrences(start: string, r: Recurrence): { dates: string[]; truncated: boolean } {
  const a = parseISO(start);
  const interval = Math.max(1, Math.floor(r.interval || 1));
  const openEnd = !r.until && !r.count;
  const horizon = openEnd
    ? iso(new Date(a.getFullYear() + OPEN_END_YEARS, a.getMonth(), a.getDate() - 1))
    : r.until ?? null;
  const limit = Math.min(r.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const out: string[] = [];
  let truncated = false;

  /** false = aufhören */
  const push = (d: Date | null): boolean => {
    if (!d) return true;
    const s = iso(d);
    if (s < start) return true;
    if (horizon && s > horizon) return false;
    if (out.length >= limit) { truncated = !r.count || r.count > MAX_OCCURRENCES; return false; }
    out.push(s);
    return true;
  };

  // Sicherheitsnetz gegen Endlosschleifen bei Regeln, die nie einen Tag treffen
  for (let step = 0; step < 5000; step++) {
    let go = true;
    if (r.freq === 'DAILY') {
      go = push(addDays(a, step * interval));
    } else if (r.freq === 'WEEKLY') {
      const days = [...new Set(r.weekdays?.length ? r.weekdays : [dowIdx(a)])].sort();
      const week = addDays(startOfWeek(a), step * interval * 7);
      for (const wd of days) if (!(go = push(addDays(week, wd)))) break;
    } else if (r.freq === 'MONTHLY') {
      const y = a.getFullYear(), m = a.getMonth() + step * interval;
      const mode = r.monthly ?? 'DAY';
      go = push(mode === 'DAY'
        ? sameMonthDay(y, m, a.getDate())
        : nthWeekday(new Date(y, m, 1).getFullYear(), new Date(y, m, 1).getMonth(),
            dowIdx(a), mode === 'LAST' ? -1 : nthOf(a)));
    } else {
      go = push(sameMonthDay(a.getFullYear() + step * interval, a.getMonth(), a.getDate()));
    }
    if (!go) break;
  }
  return { dates: out, truncated };
}

const UNIT: Record<RecurFreq, [string, string]> = {
  DAILY: ['Tag', 'Tage'], WEEKLY: ['Woche', 'Wochen'], MONTHLY: ['Monat', 'Monate'], YEARLY: ['Jahr', 'Jahre'],
};
export const unitOf = (f: RecurFreq, n: number) => UNIT[f][n === 1 ? 0 : 1];

const short = (s: string) => {
  const d = parseISO(s);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};

/** „alle 2 Wochen am Di, Do · bis 31.12.2026“ */
export function describe(r: Recurrence, anchor: string): string {
  const a = parseISO(anchor);
  const n = Math.max(1, r.interval || 1);
  let s: string;
  if (r.freq === 'DAILY') s = n === 1 ? 'täglich' : `alle ${n} Tage`;
  else if (r.freq === 'WEEKLY') {
    const days = (r.weekdays?.length ? r.weekdays : [dowIdx(a)]).slice().sort().map((d) => DW[d]).join(', ');
    s = `${n === 1 ? 'jede Woche' : `alle ${n} Wochen`} am ${days}`;
  } else if (r.freq === 'MONTHLY') {
    const pre = n === 1 ? 'jeden Monat' : `alle ${n} Monate`;
    const mode = r.monthly ?? 'DAY';
    s = mode === 'DAY' ? `${pre} am ${a.getDate()}.`
      : `${pre} am ${mode === 'LAST' ? 'letzten' : `${nthOf(a)}.`} ${DWL[dowIdx(a)]}`;
  } else s = `${n === 1 ? 'jedes Jahr' : `alle ${n} Jahre`} am ${a.getDate()}.${a.getMonth() + 1}.`;

  if (r.until) s += ` · bis ${short(r.until)}`;
  else if (r.count) s += ` · ${r.count}×`;
  return s;
}

/** Prüft die Eingaben; wirft mit einer Meldung für die Oberfläche */
export function validateRecurrence(r: Recurrence, start: string) {
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(r.freq)) throw new Error('Unbekannte Wiederholung.');
  if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 99)
    throw new Error('Das Intervall muss zwischen 1 und 99 liegen.');
  if (r.weekdays?.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Ungültiger Wochentag.');
  if (r.until && r.until < start) throw new Error('Das Ende der Serie liegt vor dem ersten Termin.');
  if (r.count != null && (!Number.isInteger(r.count) || r.count < 1))
    throw new Error('Die Anzahl der Termine muss mindestens 1 sein.');
}
