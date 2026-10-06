'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { toast } from './Toast';
import { IcoDown, IcoInfo, IcoWarn } from './Icons';
import { niceStamp, plural } from '@/lib/dates';
import { commitPlanImport, previewPlanImport } from '@/lib/actions/plan';
import type { ImportPreview } from '@/lib/plan/import';

interface Room { id: number; name: string; color: string; planSheet: string | null }

export function PlanClient({ thisYear, rooms, imports }: {
  thisYear: number;
  rooms: Room[];
  imports: { tag: string; count: number; at: string }[];
}) {
  const router = useRouter();
  const [year, setYear] = useState(thisYear);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  const roomName = (id: number | null) => rooms.find((r) => r.id === id)?.name;

  const form = (f: File, map?: Record<string, number>) => {
    const fd = new FormData();
    fd.set('file', f);
    if (map) fd.set('mapping', JSON.stringify(map));
    return fd;
  };

  const analyze = (f: File, map?: Record<string, number>) =>
    start(async () => {
      setErr('');
      try {
        const p = await previewPlanImport(form(f, map));
        setPreview(p);
        setMapping(Object.fromEntries(p.sheets.map((s) => [s.sheet, s.roomId ?? 0])));
      } catch (e) {
        setPreview(null);
        setErr(e instanceof Error ? e.message : 'Die Datei ließ sich nicht lesen.');
      }
    });

  const pick = (f: File | null) => {
    setFile(f); setPreview(null); setErr('');
    if (f) analyze(f);
  };

  const reset = () => {
    setFile(null); setPreview(null); setConfirm(false);
    if (input.current) input.current.value = '';
  };

  const doImport = () =>
    start(async () => {
      if (!file) return;
      try {
        const res = await commitPlanImport(form(file, mapping));
        reset();
        router.refresh();
        toast(`Belegungsplan ${res.year} importiert – ${plural(res.written, 'Termin', 'Termine')}` +
          (res.removed ? `, ${res.removed} aus dem vorigen Import ersetzt` : ''));
      } catch (e) {
        setConfirm(false);
        setErr(e instanceof Error ? e.message : 'Import fehlgeschlagen.');
      }
    });

  return (
    <>
      <div className="ph">
        <div><h2>Excel-Jahresplan</h2>
          <p>Belegungspläne pro Jahr als Excel-Liste herunterladen oder eine bearbeitete Liste wieder einspielen.</p></div>
      </div>

      <div className="pb">
        <div className="grp-title"><b>Export</b><small>ein Blatt je Raum, eine Zeile je Tag – wie die bisherigen Listen</small></div>
        <div className="card">
          <div className="exp-row" style={{ flexWrap: 'wrap' }}>
            <div className="exp-main">
              <b>Belegungsplan {year}</b>
              <small>Alle bestätigten Termine des Jahres. Die Datei lässt sich unverändert wieder importieren.</small>
            </div>
            <select className="input" value={year} style={{ width: 110 }}
              onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <a className="btn btn-primary" href={`/plan/export?year=${year}`} download>
              <IcoDown s={15} /> Excel herunterladen
            </a>
          </div>
        </div>

        <div className="grp-title"><b>Import</b><small>ersetzt den vorigen Import desselben Jahres</small></div>
        <div className="card">
          <div className="exp-row" style={{ flexWrap: 'wrap' }}>
            <div className="exp-main">
              <b>{file ? file.name : 'Excel-Datei wählen'}</b>
              <small>
                {busy && !confirm ? 'Datei wird gelesen …'
                  : preview ? `Plan ${preview.year} · ${plural(preview.total, 'Termin', 'Termine')} zum Import`
                  : 'Blätter wie „SAAL 26“, „ROT 26“ … mit den Spalten Datum, Tag, von, bis, Gruppe, Ansprechperson, Anmerkungen, Träger.'}
              </small>
            </div>
            <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              style={{ display: 'none' }} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            {file && <button className="btn btn-ghost" disabled={busy} onClick={reset}>Verwerfen</button>}
            <button className="btn btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
              {file ? 'Andere Datei …' : 'Datei auswählen …'}
            </button>
          </div>

          {preview && preview.sheets.map((s) => {
            const room = mapping[s.sheet] ?? 0;
            return (
              <div className="exp-row" key={s.sheet} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{ background: rooms.find((r) => r.id === room)?.color ?? 'var(--text-3)',
                  width: 11, height: 11, borderRadius: 3, flex: 'none', marginTop: 5 }} />
                <div className="exp-main">
                  <b>Blatt „{s.sheet}“</b>
                  <small>
                    {room
                      ? <>{plural(s.count, 'Termin', 'Termine')}
                        {s.through > 0 && <>, {s.through} mehrtägig</>}
                        {s.dupes > 0 && <>, {plural(s.dupes, 'Dublette', 'Dubletten')} übersprungen</>}
                        {s.skipped > 0 && <>, {s.skipped} Zeilen ohne Datum verworfen</>}</>
                      : <>{plural(s.count, 'Termin', 'Termine')} – wird nicht importiert</>}
                    {s.ambiguous.length > 0 && <> · passt auch auf {s.ambiguous.join(', ')}</>}
                  </small>
                  {room > 0 && s.notes.length > 0 && (
                    <details className="plan-notes">
                      <summary>{plural(s.notes.length, 'Termin', 'Termine')} mit Auslegung</summary>
                      <table>
                        <thead><tr><th>Datum</th><th>Zeit</th><th>Titel</th><th>Auslegung</th><th>Zeile</th></tr></thead>
                        <tbody>
                          {s.notes.map((n, i) => (
                            <tr key={i}><td>{n.when}</td><td>{n.time}</td><td>{n.title}</td><td>{n.text}</td><td>{n.source}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </div>
                <select className="input" value={room} style={{ width: 200 }} disabled={busy}
                  onChange={(e) => {
                    const next = { ...mapping, [s.sheet]: Number(e.target.value) };
                    setMapping(next);
                    if (file) analyze(file, next);
                  }}>
                  <option value={0}>– nicht importieren –</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            );
          })}

          {preview && (
            <div className="exp-row" style={{ flexWrap: 'wrap' }}>
              <div className="exp-main">
                {preview.replaces > 0
                  ? <small style={{ display: 'flex', gap: 6 }}><IcoWarn s={14} /><span>
                      Ersetzt {plural(preview.replaces, 'Termin', 'Termine')} aus dem vorigen Import für {preview.year}
                      {preview.editedSinceImport > 0 &&
                        <> – davon {preview.editedSinceImport} in der App nachträglich geändert oder abgesagt;
                          diese Änderungen gehen verloren</>}.
                      Von Hand angelegte Termine bleiben unverändert.</span></small>
                  : <small style={{ display: 'flex', gap: 6 }}><IcoInfo s={14} /><span>
                      Für {preview.year} gibt es noch keinen Import. Von Hand angelegte Termine bleiben unverändert,
                      identische Termine werden nicht doppelt angelegt.</span></small>}
              </div>
              <button className="btn btn-primary" disabled={busy || !preview.total} onClick={() => setConfirm(true)}>
                {plural(preview.total, 'Termin', 'Termine')} importieren
              </button>
            </div>
          )}
        </div>
        {err && <div className="err">{err}</div>}

        {imports.length > 0 && (
          <>
            <div className="grp-title"><b>Bisherige Importe</b></div>
            <div className="card">
              {imports.map((i) => (
                <div className="exp-row" key={i.tag}>
                  <div className="exp-main">
                    <b>{i.tag}</b>
                    <small>{plural(i.count, 'Termin', 'Termine')} · importiert {niceStamp(i.at)}</small>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {confirm && preview && (
        <Modal title={`Belegungsplan ${preview.year} importieren?`}
          subtitle={preview.fileName}
          onClose={() => !busy && setConfirm(false)}
          footer={<>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(false)}>Abbrechen</button>
            <button className="btn btn-primary" disabled={busy} onClick={doImport}>
              {busy ? 'Wird importiert …' : 'Jetzt importieren'}
            </button>
          </>}>
          <ul className="plan-confirm">
            {preview.sheets.filter((s) => mapping[s.sheet]).map((s) => (
              <li key={s.sheet}>„{s.sheet}“ → <b>{roomName(mapping[s.sheet])}</b>: {plural(s.count, 'Termin', 'Termine')}</li>
            ))}
          </ul>
          {preview.replaces > 0 && (
            <p className="hint"><IcoWarn s={13} />
              <span>{plural(preview.replaces, 'Termin', 'Termine')} aus dem vorigen Import für {preview.year} werden vorher gelöscht.</span></p>
          )}
          <p className="hint"><IcoInfo s={13} />
            <span>Die Zuordnung der Blätter wird an den Räumen gespeichert und beim nächsten Import und Export wieder benutzt.</span></p>
        </Modal>
      )}
    </>
  );
}
