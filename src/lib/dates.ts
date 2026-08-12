export const DW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const DWL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];

export const HOUR_START = 7;
export const HOUR_END = 23;
export const ROW = 52;   // Pixel pro Stunde
export const SNAP = 15;  // Rasterung beim Ziehen, Minuten

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}
export const sameDay = (a: Date, b: Date) => iso(a) === iso(b);
export const dowIdx = (d: Date) => (d.getDay() + 6) % 7;
export const isWeekend = (d: Date) => dowIdx(d) >= 5;

/** "09:30" oder "09:30:00" → Minuten seit Mitternacht */
export function min(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** Schneidet Sekunden ab, die Postgres bei time-Spalten mitliefert */
export const clock = (t: string) => t.slice(0, 5);

export function durText(m: number): string {
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}:${String(r).padStart(2, '0')} h` : h ? `${h} h` : `${r} min`;
}
export function kw(d: Date): number {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const first = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t.getTime() - first.getTime()) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7);
}
export const ymOf = (d: Date) => iso(d).slice(0, 7);
export const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;

export function niceStamp(d: Date | string | null | undefined): string {
  if (!d) return '–';
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}, ` +
    `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')} Uhr`;
}
export function longDate(d: Date): string {
  return `${DWL[dowIdx(d)]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
