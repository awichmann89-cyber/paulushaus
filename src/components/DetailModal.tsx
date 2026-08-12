'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { toast } from './Toast';
import { IcoClock, IcoDoor, IcoUser, IcoUsers } from './Icons';
import { daysOf, isMulti, rangeText, type Ev, type RoomView } from '@/lib/calendar';
import { clock, longDate, parseISO } from '@/lib/dates';
import { cancelBooking, decideBooking } from '@/lib/actions/bookings';

export function DetailModal({ ev, room, admin, onClose, onEdit }: {
  ev: Ev; room?: RoomView; admin: boolean; onClose: () => void; onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const run = (fn: () => Promise<unknown>, msg: string) =>
    start(async () => {
      try { await fn(); onClose(); router.refresh(); toast(msg); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'); }
    });

  const d = parseISO(ev.startDate);
  const over = ev.attendees > (room?.capacity ?? 0);

  return (
    <Modal
      onClose={onClose}
      head={<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: room?.color ?? '#888' }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{room?.name}</span>
          {ev.status === 'PENDING'
            ? <span className="tag wait">Anfrage offen</span>
            : <span className="tag ok">Bestätigt</span>}
        </div>
        <h3>{ev.title}</h3>
      </>}
      footer={<>
        {admin && ev.status === 'PENDING' && <>
          <button className="btn btn-danger" disabled={pending}
            onClick={() => run(() => decideBooking(ev.id, false), `„${ev.title}“ abgelehnt`)}>Ablehnen</button>
          <button className="btn btn-ok" disabled={pending}
            onClick={() => run(() => decideBooking(ev.id, true), `„${ev.title}“ bestätigt`)}>Annehmen</button>
        </>}
        {admin && ev.status === 'CONFIRMED' && <>
          <button className="btn btn-danger" disabled={pending}
            onClick={() => run(() => cancelBooking(ev.id), 'Termin abgesagt')}>Absagen</button>
          <button className="btn btn-ghost" onClick={onEdit}>Bearbeiten</button>
        </>}
        <button className="btn btn-primary" onClick={onClose}>Schließen</button>
      </>}
    >
      <div className="info-line"><IcoClock />
        <div>
          {isMulti(ev) ? <>
            <b>{rangeText(ev)}</b>
            <small>{ev.spanMode === 'DAILY'
              ? `${daysOf(ev).length} Tage · Raum nachts frei`
              : `durchgehend belegt über ${daysOf(ev).length} Tage, auch nachts`}</small>
          </> : <>
            <b>{longDate(d)}</b>
            <small>{clock(ev.startTime)} – {clock(ev.endTime)} Uhr</small>
          </>}
        </div>
      </div>

      <div className="info-line"><IcoDoor />
        <div><b>{room?.name}</b>
          <small>{room?.capacity} Plätze · {room?.groupName}{room?.equipment ? ` · ${room.equipment}` : ''}</small>
        </div>
      </div>

      <div className="info-line"><IcoUsers />
        <div><b>{ev.attendees} Personen erwartet</b>
          <small>{over ? 'überschreitet die Raumkapazität' : 'passt in den Raum'}</small></div>
      </div>

      <div className="info-line"><IcoUser />
        <div><b>{ev.createdBy ?? 'Unbekannt'}</b>
          <small>{ev.status === 'PENDING' ? 'Anfrage gestellt' : 'Eingetragen'}</small></div>
      </div>

      {ev.note && <div className="note" style={{ marginTop: 6 }}>„{ev.note}“</div>}
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}
