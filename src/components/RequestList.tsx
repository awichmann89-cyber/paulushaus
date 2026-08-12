'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import { IcoClock, IcoDoor, IcoUser, IcoUsers, IcoWarn } from './Icons';
import { rangeText, type Ev, type RoomView } from '@/lib/calendar';
import { decideBooking } from '@/lib/actions/bookings';

interface Item { ev: Ev; conflicts: { title: string; when: string }[] }

export function RequestList({ items, rooms, admin }: {
  items: Item[]; rooms: RoomView[]; admin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  const decide = (ev: Ev, ok: boolean) =>
    start(async () => {
      try {
        await decideBooking(ev.id, ok);
        router.refresh();
        toast(ok ? `„${ev.title}“ bestätigt` : `„${ev.title}“ abgelehnt`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.');
      }
    });

  if (!items.length) return <div className="empty-state">Keine offenen Anfragen.</div>;

  return (
    <>
      {err && <div className="err" style={{ margin: 16 }}>{err}</div>}
      {items.map(({ ev, conflicts }) => {
        const room = rooms.find((r) => r.id === ev.roomId);
        return (
          <div className="req" key={ev.id} style={{ ['--c' as string]: room?.color ?? '#888' }}>
            <div className="bar" />
            <div className="main">
              <h4>{ev.title}</h4>
              <div className="meta">
                <span><IcoDoor s={13} /> {room?.name}</span>
                <span><IcoClock s={13} /> {rangeText(ev)}</span>
                <span><IcoUsers s={13} /> {ev.attendees} Personen</span>
                <span><IcoUser s={13} /> {ev.createdBy ?? '–'}</span>
              </div>
              {ev.note && <div className="note">„{ev.note}“</div>}
              {conflicts.length > 0 && (
                <div className="conflict"><IcoWarn s={14} />
                  <span><b>Konflikt:</b> überschneidet sich mit „{conflicts[0].title}“ ({conflicts[0].when}) im selben Raum.</span>
                </div>
              )}
            </div>
            {admin ? (
              <div className="acts">
                <button className="btn btn-ok" disabled={pending} onClick={() => decide(ev, true)}>Annehmen</button>
                <button className="btn btn-danger" disabled={pending} onClick={() => decide(ev, false)}>Ablehnen</button>
              </div>
            ) : (
              <div className="acts"><span className="tag wait">Wartet auf Freigabe</span></div>
            )}
          </div>
        );
      })}
    </>
  );
}
