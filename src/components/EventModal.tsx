'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { toast } from './Toast';
import { IcoInfo } from './Icons';
import type { RoomView, SpanMode } from '@/lib/calendar';
import { saveBooking } from '@/lib/actions/bookings';
import { addDays, dowIdx, iso, parseISO, DW, DWL } from '@/lib/dates';
import {
  isLastOfMonth, nthOf, occurrences, unitOf, MAX_OCCURRENCES, OPEN_END_YEARS,
  type MonthlyMode, type Recurrence, type RecurFreq,
} from '@/lib/recurrence';

const dm = (s: string) => {
  const d = parseISO(s);
  return `${DW[dowIdx(d)]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};

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
  seriesId?: number | null;
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
  const [rep, setRep] = useState({
    freq: 'NONE' as RecurFreq | 'NONE',
    interval: 1,
    weekdays: [dowIdx(parseISO(draft.date))],
    monthly: 'DAY' as MonthlyMode,
    end: 'never' as 'never' | 'until' | 'count',
    until: '',
    count: 10,
  });
  const [scope, setScope] = useState<'one' | 'following'>('one');

  const inSeries = !!draft.id && !!draft.seriesId;
  const start = parseISO(f.startDate);
  const canLast = isLastOfMonth(start);
  const recurrence: Recurrence | null = draft.id || rep.freq === 'NONE' ? null : {
    freq: rep.freq,
    interval: Math.max(1, Math.min(99, Math.floor(rep.interval) || 1)),
    weekdays: rep.freq === 'WEEKLY' ? rep.weekdays : undefined,
    monthly: rep.freq === 'MONTHLY' ? (rep.monthly === 'LAST' && !canLast ? 'DAY' : rep.monthly) : undefined,
    until: rep.end === 'until' && rep.until ? rep.until : null,
    count: rep.end === 'count' ? Math.max(1, Math.floor(rep.count) || 1) : null,
  };
  const recKey = JSON.stringify(recurrence);
  const preview = useMemo(
    () => (recurrence && !(rep.end === 'until' && rep.until < f.startDate)
      ? occurrences(f.startDate, recurrence) : null),
    // recKey fasst recurrence zusammen, das Objekt selbst ist bei jedem Rendern neu
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recKey, f.startDate]);

  const setStartDate = (v: string) => {
    if (!v) return;
    setF({ ...f, startDate: v, endDate: f.endDate < v ? v : f.endDate });
    // Ein einzelner Wochentag folgt dem Startdatum, eine eigene Auswahl bleibt stehen
    if (rep.weekdays.length === 1) setRep({ ...rep, weekdays: [dowIdx(parseISO(v))] });
  };
  const toggleDay = (d: number) => {
    const has = rep.weekdays.includes(d);
    if (has && rep.weekdays.length === 1) return;   // mindestens ein Tag
    setRep({ ...rep, weekdays: has ? rep.weekdays.filter((x) => x !== d) : [...rep.weekdays, d] });
  };
  const setEnd = (end: 'never' | 'until' | 'count') =>
    setRep({ ...rep, end, until: rep.until || iso(addDays(start, 90)) });

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
          recurrence,
          scope: inSeries ? scope : undefined,
        });
        onClose();
        router.refresh();
        const n = res.count > 1 ? ` (${res.count} Termine)` : '';
        const more = res.conflicts.length > 1 ? ` und ${res.conflicts.length - 1} weiteren` : '';
        if (res.pending) toast(`Anfrage „${f.title}“${n} gesendet – wartet auf Freigabe`);
        else if (res.conflicts.length) toast(`Eingetragen${n} – Achtung: Konflikt mit „${res.conflicts[0].title}“${more}`);
        else toast(`„${f.title}“ eingetragen${n}`);
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
            onChange={(e) => setStartDate(e.target.value)} />
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

      {!draft.id && (
        <div className="field">
          <label>Wiederholung</label>
          <select className="input" value={rep.freq}
            onChange={(e) => setRep({ ...rep, freq: e.target.value as RecurFreq | 'NONE' })}>
            <option value="NONE">Keine – einmaliger Termin</option>
            <option value="DAILY">Täglich</option>
            <option value="WEEKLY">Wöchentlich</option>
            <option value="MONTHLY">Monatlich</option>
            <option value="YEARLY">Jährlich</option>
          </select>
        </div>
      )}

      {recurrence && <>
        <div className="grid2">
          <div className="field">
            <label>Wiederholen alle</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="input" type="number" min={1} max={99} value={rep.interval} style={{ width: 80 }}
                onChange={(e) => setRep({ ...rep, interval: Number(e.target.value) })} />
              <span>{unitOf(recurrence.freq, recurrence.interval)}</span>
            </div>
          </div>
          <div className="field">
            <label>Endet</label>
            <div className="seg-mini">
              <button className={rep.end === 'never' ? 'on' : ''} onClick={() => setEnd('never')}>Nie</button>
              <button className={rep.end === 'until' ? 'on' : ''} onClick={() => setEnd('until')}>Am Datum</button>
              <button className={rep.end === 'count' ? 'on' : ''} onClick={() => setEnd('count')}>Nach Anzahl</button>
            </div>
          </div>
        </div>

        {rep.freq === 'WEEKLY' && (
          <div className="field">
            <label>An diesen Tagen</label>
            <div className="seg-mini">
              {DW.map((d, i) => (
                <button key={d} className={rep.weekdays.includes(i) ? 'on' : ''} onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
          </div>
        )}

        {rep.freq === 'MONTHLY' && (
          <div className="field">
            <label>Im Monat</label>
            <div className="seg-mini">
              <button className={recurrence.monthly === 'DAY' ? 'on' : ''}
                onClick={() => setRep({ ...rep, monthly: 'DAY' })}>am {start.getDate()}.</button>
              <button className={recurrence.monthly === 'NTH' ? 'on' : ''}
                onClick={() => setRep({ ...rep, monthly: 'NTH' })}>am {nthOf(start)}. {DWL[dowIdx(start)]}</button>
              {canLast && (
                <button className={recurrence.monthly === 'LAST' ? 'on' : ''}
                  onClick={() => setRep({ ...rep, monthly: 'LAST' })}>am letzten {DWL[dowIdx(start)]}</button>
              )}
            </div>
          </div>
        )}

        {rep.end === 'until' && (
          <div className="field">
            <label>Letzter möglicher Tag</label>
            <input className="input" type="date" value={rep.until} min={f.startDate}
              onChange={(e) => setRep({ ...rep, until: e.target.value })} />
          </div>
        )}
        {rep.end === 'count' && (
          <div className="field">
            <label>Anzahl Termine</label>
            <input className="input" type="number" min={1} max={MAX_OCCURRENCES} value={rep.count}
              onChange={(e) => setRep({ ...rep, count: Number(e.target.value) })} />
          </div>
        )}

        <div className="hint"><IcoInfo s={13} /><span>
          {!preview?.dates.length
            ? 'Diese Einstellung ergibt keinen Termin.'
            : <>
                {preview.dates.length === 1 ? '1 Termin' : `${preview.dates.length} Termine`}
                {' '}von {dm(preview.dates[0])} bis {dm(preview.dates[preview.dates.length - 1])}.
                {rep.end === 'never' && ` Ohne Ende wird die Serie für ${OPEN_END_YEARS} Jahre im Voraus angelegt.`}
                {preview.truncated && ` Mehr als ${MAX_OCCURRENCES} Termine auf einmal werden nicht angelegt.`}
              </>}
        </span></div>
      </>}

      {inSeries && (
        <div className="field">
          <label>Änderung gilt für</label>
          <div className="seg-mini">
            <button className={scope === 'one' ? 'on' : ''} onClick={() => setScope('one')}>Nur diesen Termin</button>
            <button className={scope === 'following' ? 'on' : ''} onClick={() => setScope('following')}>Diesen und alle folgenden</button>
          </div>
          {scope === 'following' && (
            <div className="hint"><IcoInfo s={13} /><span>
              Titel, Raum, Uhrzeit und Notiz gelten dann für alle folgenden Termine. Ein geändertes
              Datum verschiebt jeden folgenden Termin um gleich viele Tage. Die Regel selbst lässt sich
              nicht ändern – dafür die restlichen Termine absagen und die Serie neu anlegen.
            </span></div>
          )}
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
