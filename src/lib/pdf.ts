/**
 * Monatslisten als PDF – gleiches Bild wie die Druckansicht (src/components/PrintSheets.tsx):
 * je Raum eigene Seiten, auf jeder Seite Raumkopf mit Farbe, Tabellenkopf und „Seite x von y“.
 *
 * pdf-lib mit den Standardschriften braucht keine Schriftdateien und läuft so auch auf
 * Vercel. Diese Schriften kennen nur den Windows-Zeichensatz; was darin fehlt, wird ersetzt.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { PrintRow, PrintSheet } from './print';

const MM = 72 / 25.4;
const PAGE_W = 210 * MM, PAGE_H = 297 * MM;
const MARGIN = 16 * MM;
const WIDTH = PAGE_W - 2 * MARGIN;

const COL = { day: 56, time: 74, contact: 82 };
const COL_TITLE = WIDTH - COL.day - COL.time - COL.contact;
const PAD_X = 4, PAD_Y = 4.5;
const SIZE = 8.5, LINE = 11;
const HEAD_H = 61;            // Raumkopf und Tabellenkopf
const FOOT_H = 26;            // Fußzeile samt Abstand darüber

/** Halbgeviertstrich „–“ zwischen Von und Bis */
const DASH = String.fromCharCode(0x2013);
const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.27, 0.27, 0.27);
const LIGHT = rgb(0.53, 0.53, 0.53);
const RULE = rgb(0.886, 0.886, 0.886);
const DAY_RULE = rgb(0.6, 0.6, 0.6);

const hex = (c: string): RGB => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

interface Fonts { regular: PDFFont; bold: PDFFont; clean: (s: string) => string }

/** Zeichen außerhalb des Windows-Zeichensatzes ersetzen oder weglassen (z. B. Emojis) –
 *  sonst bricht pdf-lib ab */
function cleaner(font: PDFFont) {
  const known = new Set(font.getCharacterSet());
  // Pfeil aus mehrtägigen Zeiten, geschützte und schmale Leerzeichen
  const ch = String.fromCharCode;
  // Pfeil aus mehrtägigen Zeiten wird Halbgeviertstrich, besondere Leerzeichen normale
  const map: Record<string, string> = { [ch(0x2192)]: ch(0x2013), [ch(0xa0)]: ' ', [ch(0x2009)]: ' ', [ch(0x202f)]: ' ' };
  return (s: string) => [...s.normalize('NFC')]
    .map((ch) => map[ch] ?? (known.has(ch.codePointAt(0)!) ? ch : '')).join('')
    .replace(/ {2,}/g, ' ').trim();
}

/** Zeilenumbruch an Wortgrenzen; überlange Wörter werden hart getrennt */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
    if (line) lines.push(line);
    let w = word;
    while (font.widthOfTextAtSize(w, size) > width) {
      let cut = w.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
      lines.push(w.slice(0, cut));
      w = w.slice(cut);
    }
    line = w;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** „18:00 – 16.05. 12:00“ passt nicht in die Spalte – dann nach dem Strich umbrechen */
function timeLines(text: string, font: PDFFont): string[] {
  const width = COL.time - 2 * PAD_X;
  if (font.widthOfTextAtSize(text, SIZE) <= width) return [text];
  const at = text.indexOf(` ${DASH} `);
  if (at < 0) return wrap(text, font, SIZE, width);
  return [text.slice(0, at + 2), ...wrap(text.slice(at + 3), font, SIZE, width)];
}

interface Laid { row: PrintRow; time: string[]; title: string[]; tag: string; tagOwnLine: boolean; height: number }

function layoutRow(row: PrintRow, f: Fonts): Laid {
  const width = COL_TITLE - 2 * PAD_X;
  const time = timeLines(f.clean(row.time), f.regular);
  const title = wrap(f.clean(row.title), f.regular, SIZE, width);
  const tag = row.multi ? 'DURCHGEHEND' : row.daily ? 'SERIE' : '';
  const tagW = tag ? f.regular.widthOfTextAtSize(tag, 6) + 6 : 0;
  const lastW = f.regular.widthOfTextAtSize(title[title.length - 1], SIZE);
  const tagOwnLine = !!tag && lastW + 5 + tagW > width;
  const lines = Math.max(time.length, title.length + (tagOwnLine ? 1 : 0));
  return { row, time, title, tag, tagOwnLine, height: 2 * PAD_Y + (lines - 1) * LINE + SIZE };
}

function roundedRect(page: PDFPage, x: number, top: number, size: number, r: number, color: RGB) {
  const s = size;
  page.drawSvgPath(
    `M ${r} 0 H ${s - r} Q ${s} 0 ${s} ${r} V ${s - r} Q ${s} ${s} ${s - r} ${s} H ${r} Q 0 ${s} 0 ${s - r} V ${r} Q 0 0 ${r} 0 Z`,
    { x, y: top, color },
  );
}

/** Raumkopf und Tabellenkopf; gibt die Oberkante der ersten Tabellenzeile zurück */
function drawHead(page: PDFPage, s: PrintSheet, cont: boolean, f: Fonts): number {
  const color = hex(s.color);
  let y = PAGE_H - MARGIN;
  page.drawText(f.clean(s.name), { x: MARGIN, y: y - 15, size: 15, font: f.bold, color: BLACK });
  page.drawText(f.clean(s.sub + (cont ? ' · Fortsetzung' : '')), { x: MARGIN, y: y - 28, size: 8, font: f.regular, color: GREY });
  roundedRect(page, MARGIN + WIDTH - 26, y, 26, 4.5, color);
  y -= 38;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + WIDTH, y }, thickness: 2.2, color });

  y -= 18;
  const heads: [string, number][] = [['TAG', 0], ['UHRZEIT', COL.day], ['BELEGUNG', COL.day + COL.time], ['ANSPRECHPERSON', COL.day + COL.time + COL_TITLE]];
  for (const [label, x] of heads) {
    page.drawText(label, { x: MARGIN + x + PAD_X, y, size: 6.5, font: f.bold, color: BLACK });
  }
  y -= 5;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + WIDTH, y }, thickness: 0.75, color: BLACK });
  return y;   // = PAGE_H - MARGIN - HEAD_H
}

function drawFoot(page: PDFPage, s: PrintSheet, stand: string, no: number, total: number, f: Fonts) {
  const y = MARGIN + 12;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + WIDTH, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  page.drawText(f.clean(`Paulushaus Raumplaner · Stand ${stand}`), { x: MARGIN, y: MARGIN + 2, size: 7, font: f.regular, color: rgb(0.4, 0.4, 0.4) });
  const right = `${s.count === 1 ? '1 Termin' : `${s.count} Termine`} · Seite ${no} von ${total}`;
  page.drawText(right, {
    x: MARGIN + WIDTH - f.regular.widthOfTextAtSize(right, 7), y: MARGIN + 2, size: 7, font: f.regular, color: rgb(0.4, 0.4, 0.4),
  });
}

function drawRow(page: PDFPage, l: Laid, top: number, showDay: boolean, first: boolean, f: Fonts) {
  const base = top - PAD_Y - SIZE * 0.78;
  if (showDay) {
    if (!first) page.drawLine({ start: { x: MARGIN, y: top }, end: { x: MARGIN + WIDTH, y: top }, thickness: 0.6, color: DAY_RULE });
    page.drawText(f.clean(l.row.dayText), { x: MARGIN + PAD_X, y: base, size: SIZE, font: f.bold, color: BLACK });
  }
  l.time.forEach((line, i) => page.drawText(line, { x: MARGIN + COL.day + PAD_X, y: base - i * LINE, size: SIZE, font: f.regular, color: BLACK }));

  const tx = MARGIN + COL.day + COL.time + PAD_X;
  l.title.forEach((line, i) => page.drawText(line, { x: tx, y: base - i * LINE, size: SIZE, font: f.regular, color: BLACK }));
  if (l.tag) {
    const last = l.title.length - 1;
    const x = l.tagOwnLine ? tx : tx + f.regular.widthOfTextAtSize(l.title[last], SIZE) + 5;
    const y = base - (l.tagOwnLine ? l.title.length : last) * LINE;
    const w = f.regular.widthOfTextAtSize(l.tag, 6) + 6;
    page.drawRectangle({ x, y: y - 2, width: w, height: 8.5, borderColor: LIGHT, borderWidth: 0.6 });
    page.drawText(l.tag, { x: x + 3, y: y + 0.2, size: 6, font: f.regular, color: GREY });
  }

  page.drawText(f.clean(l.row.contact || '–'), {
    x: MARGIN + COL.day + COL.time + COL_TITLE + PAD_X, y: base, size: SIZE, font: f.regular, color: GREY,
  });
  const bottom = top - l.height;
  page.drawLine({ start: { x: MARGIN, y: bottom }, end: { x: MARGIN + WIDTH, y: bottom }, thickness: 0.5, color: RULE });
}

export async function buildMonthPdf(sheets: PrintSheet[], stand: string, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator('Paulushaus Raumplaner');
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const f: Fonts = { regular, bold, clean: cleaner(regular) };

  const room = PAGE_H - 2 * MARGIN - HEAD_H - FOOT_H;

  for (const s of sheets) {
    const laid = s.rows.map((r) => layoutRow(r, f));
    const pages: Laid[][] = [[]];
    let used = 0;
    for (const l of laid) {
      if (used + l.height > room && pages[pages.length - 1].length) { pages.push([]); used = 0; }
      pages[pages.length - 1].push(l);
      used += l.height;
    }

    pages.forEach((part, pi) => {
      const page = doc.addPage([PAGE_W, PAGE_H]);
      let y = drawHead(page, s, pi > 0, f);
      if (!s.rows.length) {
        const msg = 'Keine Termine in diesem Monat.';
        page.drawText(msg, { x: MARGIN + (WIDTH - regular.widthOfTextAtSize(msg, SIZE)) / 2, y: y - 22, size: SIZE, font: regular, color: LIGHT });
      }
      let last = '';
      for (const [i, l] of part.entries()) {
        // Der Tag steht bei jedem Tageswechsel und oben auf jeder Seite
        drawRow(page, l, y, l.row.day !== last, i === 0, f);
        last = l.row.day;
        y -= l.height;
      }
      drawFoot(page, s, stand, pi + 1, pages.length, f);
    });
  }
  return doc.save();
}
