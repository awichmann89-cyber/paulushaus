/**
 * Export eines Jahres als Excel-Belegungsplan – im selben Aufbau wie die
 * bisherigen Listen (ein Blatt je Raum, eine Zeile je Tag bzw. Termin).
 *
 * Geschrieben wird so, dass src/lib/plan/parse.ts die Datei verlustfrei
 * wieder einliest: durchgehende Termine als „HH:MM | ganztägig“, „ganztägig“
 * und „bis | HH:MM“, die Notiz verteilt auf Anmerkungen, Ansprechperson, Träger.
 */
import ExcelJS from 'exceljs';
import { ALLDAY_END, ALLDAY_START, sheetLabel, splitNote } from './parse';

export interface PlanRoom { id: number; name: string; color: string; planSheet: string | null }
export interface PlanBooking {
  roomId: number; title: string; note: string | null;
  startDate: string; endDate: string; startTime: string; endTime: string;
  spanMode: 'SINGLE' | 'THROUGH' | 'DAILY';
}

type Cell = string | Date | null;
interface Line { von: Cell; bis: Cell; title: string; note: string; contact: string; carrier: string; sort: string }

const DW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const ALLDAY = 'ganztägig';

const utcDay = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
};
const isoUtc = (d: Date) => d.toISOString().slice(0, 10);
/** Uhrzeit als echter Excel-Zeitwert (Bruchteil eines Tages ab dem Nulldatum) */
const timeCell = (t: string): Date => {
  const [h, m] = t.split(':').map(Number);
  return new Date(Date.UTC(1899, 11, 30, h, m));
};

/** Excel erlaubt höchstens 31 Zeichen und keine []:*?/\ in Blattnamen */
const safeSheet = (s: string) => s.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31);

/** Name des Blatts ohne Jahr, z. B. „SAAL“ – die Zuordnung am Raum oder sein Name */
export const roomSheetLabel = (r: PlanRoom) => sheetLabel(r.planSheet?.trim() || r.name.toUpperCase());

function linesFor(b: PlanBooking, year: number): [string, Line][] {
  const st = b.startTime.slice(0, 5), en = b.endTime.slice(0, 5);
  const { note, contact, carrier } = splitNote(b.note);
  const base = { title: b.title, note, contact, carrier };
  const inYear = (d: string) => d.startsWith(`${year}-`);

  const days: string[] = [];
  for (let d = utcDay(b.startDate); isoUtc(d) <= b.endDate; d.setUTCDate(d.getUTCDate() + 1)) days.push(isoUtc(d));

  const plain = (): Line => (st === ALLDAY_START && en === ALLDAY_END
    ? { ...base, von: ALLDAY, bis: ALLDAY, sort: st }
    : { ...base, von: timeCell(st), bis: timeCell(en), sort: st });

  if (days.length === 1 || b.spanMode === 'DAILY') {
    return days.filter(inYear).map((d) => [d, plain()]);
  }

  // Durchgehend: erster Tag ab Startzeit, dazwischen ganztägig, letzter Tag „bis Endzeit“
  return days.map((d, i): [string, Line] => {
    const first = i === 0, last = i === days.length - 1;
    if (first) {
      return [d, { ...base, von: st === ALLDAY_START ? ALLDAY : timeCell(st), bis: ALLDAY, sort: st }];
    }
    if (last && en !== ALLDAY_END) return [d, { ...base, von: 'bis', bis: timeCell(en), sort: ALLDAY_START }];
    return [d, { ...base, von: ALLDAY, bis: ALLDAY, sort: ALLDAY_START }];
  }).filter(([d]) => inYear(d));
}

export function buildPlanWorkbook(year: number, rooms: PlanRoom[], bookings: PlanBooking[]): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Paulushaus Raumplaner';
  wb.created = new Date();
  const yy = String(year).slice(2);
  const used = new Set<string>();

  for (const room of rooms) {
    const label = roomSheetLabel(room);
    let name = safeSheet(`${label} ${yy}`);
    for (let n = 2; used.has(name.toLowerCase()); n++) name = safeSheet(`${label} (${n}) ${yy}`);
    used.add(name.toLowerCase());

    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { width: 11 }, { width: 5 }, { width: 9 }, { width: 9 },
      { width: 34 }, { width: 14 }, { width: 34 }, { width: 14 },
    ];

    const argb = `FF${room.color.replace('#', '').toUpperCase()}`;
    const head = ws.getRow(1);
    head.values = ['', 'Tag', 'Uhrzeit \nvon', 'bis', 'Gruppe', 'Ansprechperson', 'Anmerkungen', 'Träger'];
    head.getCell(1).value = {
      richText: [
        { text: label, font: { bold: true, size: 12, color: { argb }, name: 'Arial Narrow' } },
        { text: '\nDatum', font: { bold: true, size: 12, name: 'Arial Narrow' } },
      ],
    };
    head.height = 34;
    head.eachCell((c, col) => {
      c.alignment = { wrapText: true, vertical: 'bottom' };
      if (col > 1) c.font = { bold: true, name: 'Arial Narrow' };
      c.border = { bottom: { style: 'thin' } };
    });

    const byDay = new Map<string, Line[]>();
    for (const b of bookings) {
      if (b.roomId !== room.id) continue;
      for (const [d, line] of linesFor(b, year)) {
        if (!byDay.has(d)) byDay.set(d, []);
        byDay.get(d)!.push(line);
      }
    }

    // Wie im Original: jeder Tag des Jahres hat mindestens eine Zeile
    for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
      const day = isoUtc(d);
      const dow = (d.getUTCDay() + 6) % 7;
      const lines = (byDay.get(day) ?? []).sort((a, b) => a.sort.localeCompare(b.sort) || a.title.localeCompare(b.title));
      const list: (Line | null)[] = lines.length ? lines : [null];
      for (const l of list) {
        const row = ws.addRow([
          new Date(d), DW[dow],
          l?.von ?? null, l?.bis ?? null,
          l?.title ?? null, l?.contact || null, l?.note || null, l?.carrier || null,
        ]);
        row.getCell(1).numFmt = '[$-407]d/ mmm/ yy;@';
        row.getCell(3).numFmt = 'h:mm;@';
        row.getCell(4).numFmt = 'h:mm;@';
        if (dow >= 5) {
          row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
        }
      }
    }
  }
  return wb;
}
