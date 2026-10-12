/**
 * Regelmäßige Termine in einem importierten Plan erkennen.
 *
 * Kandidaten sind eintägige Termine mit gleichem Titel und gleicher Uhrzeit. Für jede
 * Gruppe werden die Regeln probiert, die auch der Termin-Dialog kennt; gewählt wird die,
 * die die meisten Termine abdeckt. Lücken (Ferien, Feiertage) sind erlaubt, solange die
 * Regel überwiegend zutrifft. Erfunden wird nichts: eine Serie verbindet nur Termine, die
 * im Plan stehen – Ausreißer bleiben Einzeltermine.
 *
 * Reine Funktionen ohne Datenbank, wie parse.ts.
 */
import { dowIdx, parseISO } from '../dates';
import { describe, isLastOfMonth, occurrences, type Recurrence } from '../recurrence';
import { norm } from './parse';

/** So viele Termine braucht eine Serie mindestens */
export const MIN_MEMBERS = 4;
/** Anteil der Regeltermine, die wirklich im Plan stehen müssen */
export const MIN_COVERAGE = 0.7;
/** Längere Pausen trennen zwei Serien (z. B. Frühjahrs- und Herbstkurs) */
export const BREAK_DAYS = 70;

export interface SeriesItem {
  startDate: string; endDate: string; startTime: string; endTime: string;
  title: string; spanMode: string;
}

export interface FoundSeries {
  rule: Recurrence;          // mit until = letzter Termin der Serie
  anchor: string;            // erster Termin
  members: number[];         // Indizes in der übergebenen Liste
  missed: number;            // Regeltermine, die im Plan fehlen
  text: string;              // „jede Woche am Di · bis 15.12.2026“
}

const days = (a: string, b: string) => Math.round((+parseISO(b) - +parseISO(a)) / 864e5);

interface Fit { rule: Recurrence; anchor: string; matched: string[]; missed: number }

/** Beste Regel für eine sortierte Liste von Tagen – oder null */
function bestFit(dates: string[]): Fit | null {
  const have = new Set(dates);
  const perDay = new Map<number, number>();
  for (const d of dates) {
    const wd = dowIdx(parseISO(d));
    perDay.set(wd, (perDay.get(wd) ?? 0) + 1);
  }
  const frequent = [...perDay.entries()].filter(([, n]) => n >= 3).map(([wd]) => wd).sort();
  const last = dates[dates.length - 1];

  let best: Fit | null = null;
  let bestCoverage = 0;
  // Bei „alle 2 Wochen“ entscheidet der erste Termin über den Takt – daher mehrere Anker
  for (const anchor of dates.slice(0, 3)) {
    const a = parseISO(anchor);
    const wd = dowIdx(a);
    const rules: Recurrence[] = [
      ...(frequent.length > 1 && frequent.includes(wd) ? [{ freq: 'WEEKLY' as const, interval: 1, weekdays: frequent }] : []),
      ...[1, 2, 3, 4].map((interval) => ({ freq: 'WEEKLY' as const, interval, weekdays: [wd] })),
      { freq: 'MONTHLY', interval: 1, monthly: 'NTH' },
      ...(isLastOfMonth(a) ? [{ freq: 'MONTHLY' as const, interval: 1, monthly: 'LAST' as const }] : []),
      { freq: 'MONTHLY', interval: 1, monthly: 'DAY' },
      { freq: 'DAILY', interval: 1 },
    ];
    for (const r of rules) {
      const expected = occurrences(anchor, { ...r, until: last }).dates;
      const matched = expected.filter((d) => have.has(d));
      if (matched.length < MIN_MEMBERS) continue;
      const end = matched[matched.length - 1];
      const total = expected.filter((d) => d <= end).length;
      const coverage = matched.length / total;
      if (coverage < MIN_COVERAGE) continue;
      // Mehr Termine schlägt höhere Abdeckung; bei Gleichstand gewinnt die einfachere Regel (frühere)
      if (!best || matched.length > best.matched.length
        || (matched.length === best.matched.length && coverage > bestCoverage)) {
        best = { rule: { ...r, until: end }, anchor, matched, missed: total - matched.length };
        bestCoverage = coverage;
      }
    }
  }
  return best;
}

export function detectSeries(items: SeriesItem[]): FoundSeries[] {
  const groups = new Map<string, number[]>();
  items.forEach((b, i) => {
    if (b.startDate !== b.endDate || b.spanMode !== 'SINGLE') return;
    const k = [norm(b.title), b.startTime.slice(0, 5), b.endTime.slice(0, 5)].join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
  });

  const out: FoundSeries[] = [];
  for (const idx of groups.values()) {
    if (idx.length < MIN_MEMBERS) continue;
    idx.sort((x, y) => items[x].startDate.localeCompare(items[y].startDate));

    // An langen Pausen trennen
    const segments: number[][] = [[idx[0]]];
    for (let j = 1; j < idx.length; j++) {
      const prev = items[idx[j - 1]].startDate, cur = items[idx[j]].startDate;
      if (days(prev, cur) > BREAK_DAYS) segments.push([]);
      segments[segments.length - 1].push(idx[j]);
    }

    for (const seg of segments) {
      // Eine Gruppe kann mehrere Serien enthalten, z. B. dienstags und jeden 1. Samstag
      let rest = seg;
      while (rest.length >= MIN_MEMBERS) {
        const byDate = new Map(rest.map((i) => [items[i].startDate, i]));
        const fit = bestFit(rest.map((i) => items[i].startDate));
        if (!fit) break;
        const members = fit.matched.map((d) => byDate.get(d)!);
        out.push({ rule: fit.rule, anchor: fit.anchor, members, missed: fit.missed, text: describe(fit.rule, fit.anchor) });
        const taken = new Set(members);
        rest = rest.filter((i) => !taken.has(i));
      }
    }
  }
  return out;
}
