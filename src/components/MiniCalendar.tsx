'use client';

import { useState } from 'react';
import { addDays, DW, iso, MON, sameDay, startOfWeek } from '@/lib/dates';
import { IcoLeft, IcoRight } from './Icons';

export function MiniCalendar({ cursor, today, view, onPick }: {
  cursor: Date; today: Date; view: string; onPick: (dateISO: string) => void;
}) {
  const [month, setMonth] = useState(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const start = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1));
  const wk = startOfWeek(cursor);

  return (
    <div className="mini">
      <div className="mini-head">
        <b>{MON[month.getMonth()]} {month.getFullYear()}</b>
        <span style={{ display: 'flex', gap: 2 }}>
          <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label="Voriger Monat"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><IcoLeft s={13} /></button>
          <button className="icon-btn" style={{ width: 22, height: 22 }} aria-label="Nächster Monat"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><IcoRight s={13} /></button>
        </span>
      </div>
      <div className="mini-grid">
        {DW.map((d) => <div className="dw" key={d}>{d[0]}</div>)}
        {Array.from({ length: 42 }, (_, i) => {
          const d = addDays(start, i);
          const cls = [
            d.getMonth() !== month.getMonth() ? 'out' : '',
            sameDay(d, today) ? 'today' : '',
            sameDay(d, cursor) ? 'sel' : '',
            view === 'week' && d >= wk && d < addDays(wk, 7) ? 'inweek' : '',
          ].filter(Boolean).join(' ');
          return <button key={i} className={cls} onClick={() => onPick(iso(d))}>{d.getDate()}</button>;
        })}
      </div>
    </div>
  );
}
