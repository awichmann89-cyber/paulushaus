'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addDays, DW, DWL, HOUR_END, HOUR_START, hhmm, iso, isWeekend, min, parseISO, ROW, sameDay,
  SNAP, startOfWeek, durText, clock, dowIdx,
} from '@/lib/dates';
import {
  contText, evStyle, isThrough, layout, segOn, type Ev, type GroupView, type RoomView, type Seg,
} from '@/lib/calendar';
import { useNow } from '@/lib/useNow';

export interface ViewProps {
  events: Ev[];
  rooms: RoomView[];
  groups: GroupView[];
  cursor: Date;
  today: Date;
  pub?: boolean;
  onOpen?: (id: number) => void;
  onCreate?: (d: { date: string; start: string; end: string }) => void;
  onPickDay?: (dateISO: string) => void;
  /** Wischgeste auf dem Handy: -1 = zurück, 1 = weiter (wie in nativen Kalender-Apps) */
  onSwipe?: (dir: -1 | 1) => void;
}

const roomOf = (rooms: RoomView[], id: number) => rooms.find((r) => r.id === id);

/* ================= Wochen- und Tagesansicht ================= */
export function WeekGrid({ days, ...p }: ViewProps & { days: 1 | 7 }) {
  const start = days === 7 ? startOfWeek(p.cursor) : new Date(p.cursor);
  const cols = `var(--gutter) repeat(${days},minmax(var(--daycol-min,0px),1fr))`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ date: string; top: number; a: number; b: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (8 - HOUR_START) * ROW - 8;
  }, [days]);

  const snap = useCallback((y: number) => {
    const m = Math.round((y / ROW) * 60 / SNAP) * SNAP + HOUR_START * 60;
    return Math.max(HOUR_START * 60, Math.min(HOUR_END * 60, m));
  }, []);

  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => {
      const nb = snap(e.clientY - drag.top);
      setDrag((d) => (d && d.b !== nb ? { ...d, b: nb, moved: true } : d));
    };
    const up = () => {
      setDrag(null);
      let s = Math.min(drag.a, drag.b), t = Math.max(drag.a, drag.b);
      if (t - s < SNAP) t = s + 60;
      if (t > HOUR_END * 60) { t = HOUR_END * 60; s = Math.min(s, t - SNAP); }
      p.onCreate?.({ date: drag.date, start: hhmm(s), end: hhmm(t) });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    document.body.classList.add('dragging');
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('dragging');
    };
  }, [drag, snap, p]);

  const now = useNow();
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : -1;

  /* Wischgeste zum Blättern (Handy): Inhalt folgt dem Finger live, bei
     genügend Schwung/Weite wird der Tag-/Wochenwechsel ausgelöst und der
     neue Inhalt schiebt von der jeweils anderen Seite nach – wie in
     nativen Kalender-Apps. Senkrechtes Scrollen und normales Antippen von
     Terminen bleiben unangetastet (Geste wird erst nach eindeutig
     waagerechter Bewegung als Wisch gewertet). */
  const [tx, setTx] = useState(0);
  const [swipeAnim, setSwipeAnim] = useState(false);
  const touchRef = useRef<{ x: number; y: number; t: number; dragging: boolean } | null>(null);
  const pendingDir = useRef<-1 | 1 | null>(null);
  const curKey = iso(p.cursor);

  useEffect(() => {
    if (pendingDir.current !== null) {
      const w = swipeRef.current?.clientWidth || 320;
      const dir = pendingDir.current;
      pendingDir.current = null;
      setSwipeAnim(false);
      setTx(dir === 1 ? w : -w);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setSwipeAnim(true);
        setTx(0);
      }));
    } else {
      setSwipeAnim(false);
      setTx(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!p.onSwipe) return;
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), dragging: false };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touchRef.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.dragging) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { touchRef.current = null; return; }
      s.dragging = true;
    }
    const w = swipeRef.current?.clientWidth || 320;
    const lin = Math.min(Math.abs(dx), w * 0.6);
    const over = Math.max(0, Math.abs(dx) - w * 0.6) * 0.32; // Bremse, wenn sehr weit gezogen
    const mag = lin + over;
    setSwipeAnim(false);
    setTx(dx < 0 ? -mag : mag);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s || !s.dragging || !p.onSwipe) { setSwipeAnim(true); setTx(0); return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x, dt = Date.now() - s.t;
    const w = swipeRef.current?.clientWidth || 320;
    const commit = Math.abs(dx) > Math.min(90, w * 0.22) || (Math.abs(dx) > 36 && dt < 220);
    setSwipeAnim(true);
    if (commit) {
      const dir: -1 | 1 = dx < 0 ? 1 : -1;
      setTx(dir === 1 ? -w : w);
      pendingDir.current = dir;
      p.onSwipe(dir);
    } else {
      setTx(0);
    }
  };

  return (
    <div
      className="cal-swipe"
      ref={swipeRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: tx ? `translateX(${tx}px)` : undefined,
        transition: swipeAnim ? 'transform .24s cubic-bezier(.2,.85,.3,1)' : 'none',
      }}
    >
      <div className="cal-head" style={{ gridTemplateColumns: cols }}>
        <div className="corner" />
        {Array.from({ length: days }, (_, i) => {
          const d = addDays(start, i);
          return (
            <div key={i} className={`dayhead${sameDay(d, p.today) ? ' today' : ''}${isWeekend(d) ? ' we' : ''}`}>
              <div className="dw">{DW[dowIdx(d)]}</div>
              <div className="dn">{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-grid" style={{ gridTemplateColumns: cols, height: (HOUR_END - HOUR_START) * ROW }}>
          <div className="times">
            {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => {
              const h = HOUR_START + i;
              return <i key={h} style={{ top: i * ROW + (i === 0 ? 7 : 0) }}>{String(h).padStart(2, '0')}:00</i>;
            })}
          </div>

          {Array.from({ length: days }, (_, i) => {
            const d = addDays(start, i);
            const dISO = iso(d);
            const segs = p.events
              .map((e) => ({ e, g: segOn(e, dISO) }))
              .filter((x): x is { e: Ev; g: Seg } => !!x.g);
            const placed = layout(segs, (x) => ({ s: x.g.s, e: x.g.e }));

            return (
              <div
                key={dISO}
                className={`daycol${isWeekend(d) ? ' we' : ''}`}
                onMouseDown={(ev) => {
                  if (p.pub || ev.button !== 0) return;
                  if ((ev.target as HTMLElement).closest('.ev')) return;
                  ev.preventDefault();
                  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                  const a = snap(ev.clientY - rect.top);
                  setDrag({ date: dISO, top: rect.top, a, b: a, moved: false });
                }}
              >
                {placed.map(({ item, col, total }) => {
                  const { e, g } = item;
                  const top = (g.s - HOUR_START * 60) / 60 * ROW;
                  const h = Math.max(20, (g.e - g.s) / 60 * ROW - 2);
                  const w = 100 / total;
                  const room = roomOf(p.rooms, e.roomId);
                  const cont = g.l || g.r;
                  return (
                    <div
                      key={e.id}
                      className={`ev${e.status === 'PENDING' ? ' pending' : ''}${g.l ? ' cl' : ''}${g.r ? ' cr' : ''}`}
                      style={{
                        ...evStyle(room?.color ?? '#007AFF'),
                        top, height: h,
                        left: `calc(${col * w}% + 3px)`, width: `calc(${w}% - 6px)`,
                      }}
                      onClick={(ev) => { ev.stopPropagation(); if (!p.pub) p.onOpen?.(e.id); }}
                    >
                      {g.l && <span className="cont up">▲</span>}
                      {g.r && <span className="cont dn">▼</span>}
                      <div className="ev-in">
                        {e.status === 'PENDING' && <span className="dot" />}
                        <b>{p.pub ? room?.name : e.title}</b>
                        {h > 30 && (
                          <em>
                            {cont ? contText(e, g) : `${clock(e.startTime)}–${clock(e.endTime)}`}
                            {p.pub ? ' · belegt' : ` · ${room?.name ?? ''}`}
                          </em>
                        )}
                      </div>
                    </div>
                  );
                })}

                {drag?.date === dISO && (() => {
                  const s = Math.min(drag.a, drag.b);
                  const dur = Math.max(SNAP, Math.abs(drag.b - drag.a));
                  return (
                    <div className="ev ghost" style={{
                      top: (s - HOUR_START * 60) / 60 * ROW, height: dur / 60 * ROW - 2,
                      left: 3, right: 3, pointerEvents: 'none',
                    }}>
                      <b>{hhmm(s)} – {hhmm(s + dur)}</b>
                      <em>{durText(dur)}{drag.moved ? '' : ' · ziehen zum Verlängern'}</em>
                    </div>
                  );
                })()}

                {sameDay(d, p.today) && nowMin >= 0 && (
                  <div className="nowline" style={{ top: (nowMin - HOUR_START * 60) / 60 * ROW }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ================= Monatsansicht ================= */

export function MonthGrid(p: ViewProps) {
  const first = new Date(p.cursor.getFullYear(), p.cursor.getMonth(), 1);
  const start = startOfWeek(first);

  return (
    <div className="month">
      <div className="month-dw">{DWL.map((d) => <div key={d}>{d}</div>)}</div>
      <div className="month-grid">
        {Array.from({ length: 6 }, (_, w) => {
          const wStart = addDays(start, w * 7), wEnd = addDays(wStart, 6);
          const bars = p.events.filter(isThrough).flatMap((e) => {
            const a = parseISO(e.startDate), z = parseISO(e.endDate);
            if (z < wStart || a > wEnd) return [];
            return [{
              e,
              from: Math.max(0, Math.round((+a - +wStart) / 864e5)),
              to: Math.min(6, Math.round((+z - +wStart) / 864e5)),
              l: a < wStart, r: z > wEnd, lane: 0,
            }];
          }).sort((x, y) => x.from - y.from || y.to - x.to);

          const lanes: (typeof bars)[] = [];
          for (const b of bars) {
            let i = lanes.findIndex((L) => L.every((o) => o.to < b.from || o.from > b.to));
            if (i < 0) { lanes.push([b]); i = lanes.length - 1; } else lanes[i].push(b);
            b.lane = i;
          }

          return (
            <div className="mrow" key={w}>
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(wStart, i), dISO = iso(d);
                const out = d.getMonth() !== p.cursor.getMonth();
                const evs = p.events
                  .map((e) => ({ e, g: segOn(e, dISO) }))
                  .filter((x): x is { e: Ev; g: Seg } => !!x.g && !isThrough(x.e))
                  .sort((a, b) => a.g.s - b.g.s);
                const space = Math.max(0, 3 - lanes.length);
                const show = evs.slice(0, space), rest = evs.length - show.length;

                return (
                  <div
                    key={dISO}
                    className={`mcell${out ? ' out' : ''}${isWeekend(d) ? ' we' : ''}${sameDay(d, p.today) ? ' today' : ''}`}
                    onClick={() => { if (!p.pub) p.onCreate?.({ date: dISO, start: '18:00', end: '20:00' }); }}
                  >
                    <div className="num">{d.getDate()}</div>
                    <div className="mspace" style={{ height: lanes.length * 19 }} />
                    {show.map(({ e }) => {
                      const room = roomOf(p.rooms, e.roomId);
                      return (
                        <div key={e.id} className={`chip${e.status === 'PENDING' ? ' pending' : ''}`}
                          style={evStyle(room?.color ?? '#007AFF')}
                          onClick={(ev) => { ev.stopPropagation(); if (!p.pub) p.onOpen?.(e.id); }}>
                          <i>{clock(e.startTime)}</i><b>{p.pub ? room?.name : e.title}</b>
                        </div>
                      );
                    })}
                    {rest > 0 && (
                      <div className="more" onClick={(ev) => { ev.stopPropagation(); p.onPickDay?.(dISO); }}>
                        +{rest} weitere
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="mbars">
                {bars.map((b) => {
                  const room = roomOf(p.rooms, b.e.roomId);
                  const wd = (b.to - b.from + 1) / 7 * 100, l = b.from / 7 * 100;
                  return (
                    <div key={b.e.id}
                      className={`mbar${b.e.status === 'PENDING' ? ' pending' : ''}${b.l ? ' cl' : ''}${b.r ? ' cr' : ''}`}
                      style={{
                        ...evStyle(room?.color ?? '#007AFF'),
                        left: `calc(${l}% + 3px)`, width: `calc(${wd}% - 6px)`, top: b.lane * 19,
                      }}
                      onClick={(ev) => { ev.stopPropagation(); if (!p.pub) p.onOpen?.(b.e.id); }}>
                      {b.l && '‹ '}<b>{p.pub ? room?.name : b.e.title}</b>{b.r && ' ›'}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= Raum-Timeline ================= */
export function RoomTimeline(p: ViewProps) {
  const dISO = iso(p.cursor);
  const hrs = HOUR_END - HOUR_START;
  const colW = 76;
  const cols = `210px repeat(${hrs},${colW}px)`;
  const now = useNow();
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : -1;

  return (
    <div className="tl">
      <div className="tl-head" style={{ gridTemplateColumns: cols }}>
        <div className="corner">Raum</div>
        {Array.from({ length: hrs }, (_, i) => (
          <div className="h" key={i}>{String(HOUR_START + i).padStart(2, '0')}:00</div>
        ))}
      </div>

      {p.groups.map((g) => (
        <div key={g.id}>
          <div className="tl-grp">{g.name}</div>
          {g.rooms.map((r) => {
            const segs = p.events
              .filter((e) => e.roomId === r.id)
              .map((e) => ({ e, g: segOn(e, dISO) }))
              .filter((x): x is { e: Ev; g: Seg } => !!x.g);
            const placed = layout(segs, (x) => ({ s: x.g.s, e: x.g.e }));
            const maxLanes = Math.max(1, ...placed.map((x) => x.total));
            const load = segs.reduce((a, x) => a + x.g.e - x.g.s, 0) / 60;

            return (
              <div className="tl-row" key={r.id}
                style={{ gridTemplateColumns: cols, minHeight: Math.max(62, maxLanes * 54) }}>
                <div className="tl-room" style={{ ['--c' as string]: r.color }}>
                  <span className="sw" />
                  <span>
                    <b>{r.name}</b>
                    <small>{r.capacity} Plätze · {load > 0 ? `${load.toFixed(1)} h belegt` : 'frei'}</small>
                  </span>
                </div>
                <div className="tl-lane" style={{ gridColumn: '2 / -1', ['--colW' as string]: `${colW}px` }}>
                  {placed.map(({ item, col, total }) => {
                    const { e, g } = item;
                    const left = (g.s - HOUR_START * 60) / 60 * colW;
                    const w = (g.e - g.s) / 60 * colW - 4;
                    const laneH = 100 / total, top = col * laneH;
                    return (
                      <div key={e.id}
                        className={`tl-ev${e.status === 'PENDING' ? ' pending' : ''}${g.l ? ' cl' : ''}${g.r ? ' cr' : ''}`}
                        style={{
                          ...evStyle(r.color), left: left + 2, width: w,
                          top: `calc(${top}% + 5px)`, bottom: `calc(${100 - top - laneH}% + 5px)`,
                        }}
                        onClick={() => { if (!p.pub) p.onOpen?.(e.id); }}>
                        <b>{g.l && '‹ '}{p.pub ? r.name : e.title}{g.r && ' ›'}</b>
                        {total < 2 && (
                          <em>
                            {g.l || g.r ? 'durchgehend belegt' : `${clock(e.startTime)}–${clock(e.endTime)}`}
                            {p.pub ? '' : ` · ${e.createdBy ?? ''}`}
                          </em>
                        )}
                      </div>
                    );
                  })}
                  {sameDay(p.cursor, p.today) && nowMin >= 0 && (
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0, zIndex: 6,
                      left: (nowMin - HOUR_START * 60) / 60 * colW, width: 1.5, background: 'var(--red)',
                    }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
