'use client';

import { useEffect, useRef, useState } from 'react';
import type { PrintRow, PrintSheet } from '@/lib/print';

/** Höhe eines Bogens – knapp unter den 265 mm, die A4 bei 16 mm Rand bietet
 *  (siehe @page und #printArea .sheet in globals.css) */
const PAGE_HEIGHT = '262mm';
/** Puffer gegen Rundungen beim Messen – lieber eine Zeile früher umbrechen */
const SAFETY = 12;

function Head({ s, cont }: { s: PrintSheet; cont: boolean }) {
  return (
    <div className="sheet-head" style={{ borderBottomColor: s.color }}>
      <div>
        <h1>{s.name}</h1>
        <p>{s.sub}{cont ? ' · Fortsetzung' : ''}</p>
      </div>
      {/* Rahmen statt Hintergrund: Browser drucken Hintergründe nur auf Wunsch */}
      <div className="sheet-mark" style={{ borderColor: s.color }} />
    </div>
  );
}

function Table({ rows, children }: { rows: PrintRow[]; children?: React.ReactNode }) {
  let last = '';
  return (
    <table className="sheet-table">
      <thead>
        <tr><th>Tag</th><th>Uhrzeit</th><th>Belegung</th><th>Ansprechperson</th></tr>
      </thead>
      <tbody>
        {children}
        {rows.map((r, i) => {
          // Der Tag steht bei jedem Tageswechsel und oben auf jeder Seite
          const head = r.day !== last ? r.dayText : '';
          last = r.day;
          return (
            <tr key={i} className={head ? 'new-day' : ''}>
              <td className="d">{head}</td>
              <td className="t">{r.time}</td>
              <td>{r.title}
                {r.multi && <span className="mtag">durchgehend</span>}
                {r.daily && <span className="mtag">Serie</span>}
              </td>
              <td className="o">{r.contact || '–'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Foot({ stand, count, page, pages }: { stand: string; count: number; page: number; pages: number }) {
  return (
    <div className="sheet-foot">
      <span>Paulushaus Raumplaner · Stand {stand}</span>
      <span>{count === 1 ? '1 Termin' : `${count} Termine`} · Seite {page} von {pages}</span>
    </div>
  );
}

/**
 * Teilt jede Raumliste auf A4-Seiten auf. Gemessen wird in einem unsichtbaren Bogen
 * mit Druckbreite; so steht Raumkopf, Tabellenkopf und Seitenzahl auf jeder Seite –
 * unabhängig davon, ob der Browser Tabellenköpfe beim Drucken wiederholt.
 */
export function PrintSheets({ sheets, stand, autoPrint }: { sheets: PrintSheet[]; stand: string; autoPrint: boolean }) {
  const measure = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][][] | null>(null);

  // Erst messen, wenn die Schriften stehen – sonst stimmen die Zeilenhöhen nicht
  useEffect(() => {
    let off = false;
    document.fonts.ready.then(() => { if (!off) paginate(); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets]);

  // Druckdialog erst, wenn die Seiten aufgeteilt sind
  useEffect(() => {
    if (!pages || !autoPrint) return;
    const t = setTimeout(() => window.print(), 150);
    return () => clearTimeout(t);
  }, [pages, autoPrint]);

  function paginate() {
    const root = measure.current;
    if (!root) return;
    const page = (root.querySelector('.measure-page') as HTMLElement).getBoundingClientRect().height;
    const result = sheets.map((s, si) => {
      const el = root.querySelector(`[data-sheet="${si}"]`) as HTMLElement;
      const fixed = ['.sheet-head', 'thead', '.sheet-foot']
        .reduce((sum, sel) => sum + (el.querySelector(sel) as HTMLElement).getBoundingClientRect().height, 0);
      const foot = el.querySelector('.sheet-foot') as HTMLElement;
      const gap = parseFloat(getComputedStyle(foot).marginTop) + parseFloat(getComputedStyle(el.querySelector('.sheet-head')!).marginBottom);
      const room = page - fixed - gap - SAFETY;
      const heights = [...el.querySelectorAll('tbody tr')].map((tr) => tr.getBoundingClientRect().height);

      const out: number[][] = [[]];
      let used = 0;
      heights.forEach((h, i) => {
        if (used + h > room && out[out.length - 1].length) { out.push([]); used = 0; }
        out[out.length - 1].push(i);
        used += h;
      });
      return out;
    });
    setPages(result);
  }

  return (
    <>
      {/* Messbogen: Druckbreite, unsichtbar */}
      {!pages && (
        <div ref={measure} className="sheet-measure" aria-hidden>
          <div className="measure-page" style={{ height: PAGE_HEIGHT }} />
          {sheets.map((s, si) => (
            <div className="sheet" key={s.id} data-sheet={si}>
              <Head s={s} cont={false} />
              <Table rows={s.rows} />
              <Foot stand={stand} count={s.count} page={1} pages={1} />
            </div>
          ))}
        </div>
      )}

      <div id="printArea">
        {pages && sheets.flatMap((s, si) => {
          const parts = pages[si];
          return parts.map((idx, pi) => (
            <div className="sheet" key={`${s.id}-${pi}`}>
              <Head s={s} cont={pi > 0} />
              <Table rows={idx.map((i) => s.rows[i])}>
                {s.rows.length === 0 && <tr><td colSpan={4} className="empty">Keine Termine in diesem Monat.</td></tr>}
              </Table>
              <Foot stand={stand} count={s.count} page={pi + 1} pages={parts.length} />
            </div>
          ));
        })}
      </div>
    </>
  );
}
