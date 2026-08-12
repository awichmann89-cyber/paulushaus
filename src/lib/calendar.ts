import { HOUR_START, HOUR_END, addDays, iso, min, parseISO, DW, clock } from './dates';

export type SpanMode = 'SINGLE' | 'THROUGH' | 'DAILY';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

/** Ansicht eines Termins, wie sie an den Client geht */
export interface Ev {
  id: number;
  roomId: number;
  title: string;
  note: string | null;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  spanMode: SpanMode;
  status: BookingStatus;
  attendees: number;
  createdBy: string | null;
  createdById: number | null;
  updatedAt: string;
}

export interface RoomView {
  id: number;
  name: string;
  color: string;
  capacity: number;
  equipment: string;
  groupId: number | null;
  groupName: string;
  isPublic: boolean;
}
export interface GroupView { id: number; name: string; rooms: RoomView[] }

export const isMulti = (e: Ev) => e.endDate !== e.startDate;
/** durchgehend belegt (im Gegensatz zu täglich wiederkehrend) */
export const isThrough = (e: Ev) => isMulti(e) && e.spanMode !== 'DAILY';

export function daysOf(e: Ev): string[] {
  const out: string[] = [];
  let d = parseISO(e.startDate);
  const z = parseISO(e.endDate);
  while (d <= z) { out.push(iso(d)); d = addDays(d, 1); }
  return out;
}

export interface Seg { s: number; e: number; l: boolean; r: boolean }

/** Belegtes Zeitfenster an einem konkreten Tag – null, wenn der Tag nicht betroffen ist */
export function segOn(e: Ev, day: string): Seg | null {
  const s = min(clock(e.startTime)), t = min(clock(e.endTime));
  if (!isMulti(e)) return e.startDate === day ? { s, e: t, l: false, r: false } : null;
  if (day < e.startDate || day > e.endDate) return null;
  if (e.spanMode === 'DAILY') return { s, e: t, l: false, r: false };
  const first = day === e.startDate, last = day === e.endDate;
  return {
    s: first ? s : HOUR_START * 60,
    e: last ? t : HOUR_END * 60,
    l: !first,
    r: !last,
  };
}

export function overlaps(a: Ev, b: Ev): boolean {
  const bDays = new Set(daysOf(b));
  return daysOf(a).filter((d) => bDays.has(d)).some((d) => {
    const x = segOn(a, d), y = segOn(b, d);
    return !!x && !!y && x.s < y.e && x.e > y.s;
  });
}

export function rangeText(e: Ev): string {
  const a = parseISO(e.startDate), z = parseISO(e.endDate);
  const f = (d: Date) => `${DW[(d.getDay() + 6) % 7]} ${d.getDate()}.${d.getMonth() + 1}.`;
  const s = clock(e.startTime), t = clock(e.endTime);
  if (!isMulti(e)) return `${f(a)} ${s}–${t}`;
  return e.spanMode === 'DAILY'
    ? `${f(a)} – ${f(z)} · täglich ${s}–${t}`
    : `${f(a)} ${s} – ${f(z)} ${t}`;
}

/** Text unter dem Titel, wenn ein Block über den Tagesrand hinausläuft */
export function contText(e: Ev, seg: Seg): string {
  const a = parseISO(e.startDate), z = parseISO(e.endDate);
  const f = (d: Date) => DW[(d.getDay() + 6) % 7];
  const s = clock(e.startTime), t = clock(e.endTime);
  if (seg.l && seg.r) return `durchgehend · bis ${f(z)} ${t}`;
  if (seg.l) return `seit ${f(a)} ${s} · bis ${t}`;
  return `ab ${s} · bis ${f(z)} ${t}`;
}

/* ---------- Spaltenaufteilung bei Überschneidung ---------- */
export interface Placed<T> { item: T; col: number; total: number }
export function layout<T>(items: T[], get: (x: T) => { s: number; e: number }): Placed<T>[] {
  const sorted = [...items].sort((a, b) => get(a).s - get(b).s || get(b).e - get(a).e);
  const groups: T[][] = [];
  let cur: T[] = [], end = -1;
  for (const it of sorted) {
    if (get(it).s >= end && cur.length) { groups.push(cur); cur = []; end = -1; }
    cur.push(it);
    end = Math.max(end, get(it).e);
  }
  if (cur.length) groups.push(cur);

  const out: Placed<T>[] = [];
  for (const g of groups) {
    const cols: T[][] = [];
    const local: Placed<T>[] = [];
    for (const it of g) {
      let i = cols.findIndex((c) => get(c[c.length - 1]).e <= get(it).s);
      if (i < 0) { cols.push([it]); i = cols.length - 1; } else cols[i].push(it);
      local.push({ item: it, col: i, total: 0 });
    }
    for (const p of local) p.total = cols.length;
    out.push(...local);
  }
  return out;
}

/* ---------- Farben ---------- */
export function hexRgba(h: string, a: number): string {
  const n = parseInt(h.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function darken(h: string, f: number): string {
  const n = parseInt(h.replace('#', ''), 16);
  return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`;
}
export function evStyle(color: string): React.CSSProperties {
  return {
    ['--c' as string]: color,
    ['--cbg' as string]: hexRgba(color, 0.13),
    ['--ctx' as string]: darken(color, 0.62),
  } as React.CSSProperties;
}

export const PALETTE = ['#007AFF', '#34C759', '#FF9F0A', '#AF52DE', '#FF375F', '#00C7BE', '#5856D6', '#FF6B22'];
