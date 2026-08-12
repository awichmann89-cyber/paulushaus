'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { toast } from './Toast';
import { IcoInfo } from './Icons';
import type { RoomView, SpanMode } from '@/lib/calendar';
import { saveBooking } from '@/lib/actions/bookings';
import { parseISO } from '@/lib/dates';

export interface Draft {
  id?: number;
  roomId?: number;
  title?: string;
  note?: string;
  date: string;
  end?: string;
  start: string;
  endTime: string;
  attendees?: number;
  spanMode?: SpanMode;
}

export function EventModal({ draft, rooms, admin, onClose }: {
  draft: Draft; rooms: RoomView[]; admin: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState('');
  const [f, setF] = useState({
    roomId: draft.roomId ?? rooms[0]?.id ?? 0,
    title: draft.title ?? '',
    note: draft.note ?? '',
    startDate: draft.date,
    endDate: draft.end ?? draft.date,
    startTime: draft.start,
    endTime: draft.endTime,
    spanMode: (draft.spanMode ?? 'THROUGH') as SpanMode,
    attendees: draft.attendees ?? 10,
  });

  const multi = f.endDate > f.startDate;
  const through = f.spanMode !== 'DAILY';
  const nDays = multi
    ? Math.round((+parseISO(f.endDate) - +parseISO(f.startDate)) / 864e5) + 1 : 1;

  const submit = () => {
    setErr('');
    startTransition(async () => {
      try {
        const res = await saveBooking({
          id: draft.id, roomId: Number(f.roomId), title: f.title, note: f.note,
          startDate: f.startDate, endDate: f.endDate,
          startTime: f.startTime, endTime: f.endTime,
          spanMode: multi ? f.spanMode : 'SINGLE',
          attendees: Number(f.attendees) || 0,
        });
        onClose();
        router.refresh();
        if (res.pending) toast(`Anfrage „${f.title}“ gesendet – wartet auf Freigabe`);
        else if (res.conflicts.length) toast(`Eingetragen – Achtung: Konflikt mit „${res.conflicts[0].title}“`);
        else toast(`„${f.title}“ eingetragen`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
      }
    });
  };

  return (
    <Modal
      title={draft.id ? 'Termin bearbeiten' : admin ? 'Neuer Termin' : 'Terminanfrage stellen'}
      subtitle={admin ? 'Wird sofort im Kalender eingetragen.' : 'Geht zur Freigabe an die Hausverwaltung.'}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
        <button className="btn btn-primary" onClick={submit} disabled={pending}>
          {pending ? 'Speichern …' : draft.id ? 'Änderungen speichern' : admin ? 'Termin eintragen' : 'Anfrage senden'}
        </button>
      </>}
    >
      <div className="field">
        <label>Titel</label>
        <input className="input" value={f.title} autoFocus placeholder="z. B. Chorprobe"
          onChange={(e) => setF({ ...f, title: e.target.value })} />
      </div>

      <div className="field">
        <label>Raum / Kalender</label>
        <select className="input" value={f.roomId} onChange={(e) => setF({ ...f, roomId: Number(e.target.value) })}>
          {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.capacity} Plätze</option>)}
        </select>
      </div>

      <div className="grid2">
        <div className="field">
          <label>Von Datum</label>
          <input className="input" type="date" value={f.startDate}
            onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate })} />
        </div>
        <div className="field">
          <label>Bis Datum</label>
          <input className="input" type="date" value={f.endDate} min={f.startDate}
            onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <label>{multi && through ? 'Beginn am ersten Tag' : multi ? 'Täglich von' : 'Von'}</label>
          <input className="input" type="time" value={f.startTime}
            onChange={(e) => setF({ ...f, startTime: e.target.value })} />
        </div>
        <div className="field">
          <label>{multi && through ? 'Ende am letzten Tag' : multi ? 'Täglich bis' : 'Bis'}</label>
          <input className="input" type="time" value={f.endTime}
            onChange={(e) => setF({ ...f, endTime: e.target.value })} />
        </div>
      </div>

      {multi && (
        <div className="field">
          <label>Belegungsart</label>
          <div className="seg-mini">
            <button className={through ? 'on' : ''} onClick={() => setF({ ...f, spanMode: 'THROUGH' })}>Durchgehend</button>
            <button className={through ? '' : 'on'} onClick={() => setF({ ...f, spanMode: 'DAILY' })}>Täglich wiederkehrend</button>
          </div>
          <div className="hint"><IcoInfo s={13} /><span>
            {through
              ? `Der Raum ist über ${nDays} Tage durchgehend belegt – auch nachts. Für Feste, Aufbau und Übernachtungen.`
              : `Gleiches Zeitfenster an ${nDays} Tagen. Nachts ist der Raum frei – für Kurse und Workshops.`}
          </span></div>
        </div>
      )}

      <div className="field">
        <label>Personen</label>
        <input className="input" type="number" min={0} value={f.attendees}
          onChange={(e) => setF({ ...f, attendees: Number(e.target.value) })} />
      </div>

      <div className="field">
        <label>{admin ? 'Interne Notiz' : 'Anmerkung für die Verwaltung'}</label>
        <textarea className="input" rows={2} value={f.note} placeholder="Bestuhlung, Technik, Aufbauzeit …"
          onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>

      <div className="hint"><IcoInfo s={13} />
        <span>Konflikte werden beim Speichern automatisch geprüft – auch tageweise bei mehrtägigen Terminen.</span></div>

      {err && <div className="err">{err}</div>}
    </Modal>
  );
}
