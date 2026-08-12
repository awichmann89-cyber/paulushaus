'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MonthGrid, RoomTimeline, WeekGrid } from './CalendarViews';
import { groupOf } from '@/lib/group';
import type { Ev, RoomView } from '@/lib/calendar';
import { addDays, iso, longDate, MON, parseISO, startOfWeek } from '@/lib/dates';
import { IcoCal, IcoExpand, IcoLeft, IcoRight } from './Icons';
import { useNow } from '@/lib/useNow';

export function PublicCalendar({ events, rooms, cursor, view, today, kiosk }: {
  events: Ev[]; rooms: RoomView[]; cursor: string; view: string; today: string; kiosk: boolean;
}) {
  const router = useRouter();
  const cur = parseISO(cursor);
  const now = parseISO(today);
  const groups = useMemo(() => groupOf(rooms), [rooms]);
  const clock = useNow();

  const go = (d: Date, v: string, k = kiosk) =>
    router.push(`/oeffentlich?d=${iso(d)}&v=${v}${k ? '&kiosk=1' : ''}`, { scroll: false });

  const shift = (n: number) => {
    if (view === 'month') go(new Date(cur.getFullYear(), cur.getMonth() + n, 1), view);
    else go(addDays(cur, view === 'week' ? 7 * n : n), view);
  };

  /* Aushang-Modus: stündlich neu laden und um Mitternacht auf heute zurückspringen */
  useEffect(() => {
    if (!kiosk) return;
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [kiosk, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && kiosk) go(cur, view, false);
      const map: Record<string, string> = { d: 'day', w: 'week', m: 'month', r: 'rooms' };
      if (map[e.key]) go(cur, map[e.key]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  let title: string;
  if (view === 'week') {
    const a = startOfWeek(cur), b = addDays(a, 6);
    title = `${a.getDate()}.–${b.getDate()}. ${MON[b.getMonth()]} ${b.getFullYear()}`;
  } else if (view === 'month') title = `${MON[cur.getMonth()]} ${cur.getFullYear()}`;
  else title = longDate(cur);

  const props = { events, rooms, groups, cursor: cur, today: now, pub: true };

  return (
    <div id="public" className={`on${kiosk ? ' kiosk' : ''}`}>
      <div className="pub-top">
        <div className="pub-brand">
          <div className="mark"><IcoCal s={16} /></div>
          <div><b>Paulushaus</b><small>Raumbelegung – öffentliche Ansicht</small></div>
        </div>
        <div className="pub-nav">
          <button className="today-btn" onClick={() => go(now, view)}>Heute</button>
          <button className="icon-btn" aria-label="Zurück" onClick={() => shift(-1)}><IcoLeft /></button>
          <button className="icon-btn" aria-label="Weiter" onClick={() => shift(1)}><IcoRight /></button>
          <div className="tb-title">{title}</div>
        </div>
        <div className="pub-actions">
          <div className="segmented">
            {([['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat'], ['rooms', 'Räume']] as const).map(([v, l]) => (
              <button key={v} className={view === v ? 'on' : ''} onClick={() => go(cur, v)}>{l}</button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={() => go(cur, view, true)}><IcoExpand /> Aushang-Modus</button>
          <a className="btn btn-ghost" href="/login">Anmelden</a>
        </div>
      </div>

      <button className="kiosk-exit" onClick={() => go(cur, view, false)}>Aushang-Modus beenden (Esc)</button>

      <div className="pub-legend">
        {groups.map((g) => (
          <div className="lg" key={g.id}>
            <b>{g.name}</b>
            {g.rooms.map((r) => (
              <span className="lr" key={r.id}><i style={{ background: r.color }} />{r.name}</span>
            ))}
          </div>
        ))}
      </div>

      <div className="pub-clock">
        <b>{clock ? `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}` : '--:--'}</b>
        <span>{title}</span>
        <em>Aktualisiert sich automatisch</em>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {view === 'month' ? <MonthGrid {...props} />
          : view === 'rooms' ? <RoomTimeline {...props} />
          : <WeekGrid {...props} days={view === 'day' ? 1 : 7} />}
      </div>

      <div className="pub-foot">
        Angezeigt wird ausschließlich, ob und wann ein Raum belegt ist. Titel, Veranstalter und Details werden nicht veröffentlicht.
      </div>
    </div>
  );
}
