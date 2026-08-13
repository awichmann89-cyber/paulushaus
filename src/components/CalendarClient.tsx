'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MonthGrid, RoomTimeline, WeekGrid } from './CalendarViews';
import { EventModal, type Draft } from './EventModal';
import { DetailModal } from './DetailModal';
import { useVisibleRooms } from './AppShell';
import { groupOf } from '@/lib/group';
import type { Ev, RoomView } from '@/lib/calendar';
import { addDays, iso, parseISO } from '@/lib/dates';

export function CalendarClient({ events, rooms, admin, cursor, view, today }: {
  events: Ev[]; rooms: RoomView[]; admin: boolean; cursor: string; view: string; today: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const visible = useVisibleRooms();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const cur = parseISO(cursor);
  const now = parseISO(today);

  const shownRooms = useMemo(
    () => rooms.filter((r) => !visible || visible.has(r.id)), [rooms, visible]);
  const shownIds = useMemo(() => new Set(shownRooms.map((r) => r.id)), [shownRooms]);
  const shownEvents = useMemo(() => events.filter((e) => shownIds.has(e.roomId)), [events, shownIds]);
  const groups = useMemo(() => groupOf(shownRooms), [shownRooms]);

  /* „+ Termin anlegen“ aus der Seitenleiste kommt als ?new=1 herein */
  useEffect(() => {
    if (params.get('new') === '1') {
      setDraft({ date: cursor, start: '18:00', endTime: '20:00' });
      router.replace(`/?d=${cursor}&v=${view}`, { scroll: false });
    }
  }, [params, cursor, view, router]);

  const open = events.find((e) => e.id === openId) ?? null;
  const go = (d: string, v: string) => router.push(`/?d=${d}&v=${v}`, { scroll: false });

  const props = {
    events: shownEvents, rooms: shownRooms, groups, cursor: cur, today: now,
    onOpen: (id: number) => setOpenId(id),
    onCreate: (x: { date: string; start: string; end: string }) =>
      setDraft({ date: x.date, start: x.start, endTime: x.end }),
    onPickDay: (d: string) => go(d, 'day'),
    onSwipe: (dir: -1 | 1) => go(iso(addDays(cur, (view === 'day' ? 1 : 7) * dir)), view),
  };

  return (
    <section className="page on">
      <div className="legend">
        <span><span className="k" style={{ background: 'var(--accent)' }} /> bestätigter Termin</span>
        <span><span className="k dash" /> offene Anfrage</span>
        <span><span className="k" style={{ background: 'var(--red)' }} /> aktuelle Uhrzeit</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>
          Im Raster ziehen = Zeitraum aufziehen · Klick = 1 Stunde
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {view === 'month' ? <MonthGrid {...props} />
          : view === 'rooms' ? <RoomTimeline {...props} />
          : <WeekGrid {...props} days={view === 'day' ? 1 : 7} />}
      </div>

      {draft && <EventModal draft={draft} rooms={rooms} admin={admin} onClose={() => setDraft(null)} />}
      {open && (
        <DetailModal
          ev={open} room={rooms.find((r) => r.id === open.roomId)} admin={admin}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setDraft({
              id: open.id, roomId: open.roomId, title: open.title, note: open.note ?? '',
              date: open.startDate, end: open.endDate,
              start: open.startTime.slice(0, 5), endTime: open.endTime.slice(0, 5),
              attendees: open.attendees, spanMode: open.spanMode,
            });
            setOpenId(null);
          }}
        />
      )}
    </section>
  );
}
