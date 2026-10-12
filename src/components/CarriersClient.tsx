'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { toast } from './Toast';
import { IcoInfo, IcoPlus } from './Icons';
import { plural } from '@/lib/dates';
import { saveCarrier, setCarrierActive } from '@/lib/actions/carriers';

interface C { id: number; name: string; isActive: boolean; total: number; upcoming: number }

export function CarriersClient({ carriers }: { carriers: C[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: number | null; name: string } | null>(null);
  const [err, setErr] = useState('');
  const [busy, start] = useTransition();

  const run = (fn: () => Promise<unknown>, msg: string, after?: () => void) =>
    start(async () => {
      setErr('');
      try { await fn(); after?.(); router.refresh(); toast(msg); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'); }
    });

  const save = () => edit && run(() => saveCarrier(edit.id, edit.name),
    edit.id ? 'Träger umbenannt' : `„${edit.name.trim()}“ angelegt`, () => setEdit(null));

  const active = carriers.filter((c) => c.isActive).length;

  return (
    <>
      <div className="ph">
        <div><h2>Träger</h2>
          <p>Vereine, Gruppen und Einrichtungen, die als Träger an Terminen stehen. Ohne Account.</p></div>
        <button className="btn btn-primary" onClick={() => { setEdit({ id: null, name: '' }); setErr(''); }}>
          <IcoPlus /> Träger anlegen
        </button>
      </div>

      <div className="pb">
        {err && !edit && <div className="err" style={{ marginBottom: 14 }}>{err}</div>}

        <div className="card">
          {!carriers.length ? (
            <div className="empty-state">
              Noch keine Träger angelegt. Beim Excel-Import werden Träger aus der Spalte „Träger“ automatisch übernommen.
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Kommende Termine</th><th>Termine gesamt</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {carriers.map((c) => (
                  <tr key={c.id} style={c.isActive ? undefined : { color: 'var(--text-3)' }}>
                    <td><b style={{ fontWeight: 600 }}>{c.name}</b></td>
                    <td>{c.upcoming || '–'}</td>
                    <td>{c.total || '–'}</td>
                    <td><span className={`tag ${c.isActive ? 'ok' : 'user'}`}>{c.isActive ? 'Aktiv' : 'Archiviert'}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-ghost" disabled={busy}
                          onClick={() => { setEdit({ id: c.id, name: c.name }); setErr(''); }}>Umbenennen</button>
                        {c.isActive
                          ? <button className="btn btn-danger" disabled={busy}
                              onClick={() => run(() => setCarrierActive(c.id, false), `„${c.name}“ archiviert`)}>Archivieren</button>
                          : <button className="btn btn-ghost" disabled={busy}
                              onClick={() => run(() => setCarrierActive(c.id, true), `„${c.name}“ wieder aktiv`)}>Reaktivieren</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {carriers.length > 0 && (
          <div className="hint" style={{ marginTop: 12 }}><IcoInfo s={13} />
            <span>{plural(active, 'Träger ist', 'Träger sind')} im Termin-Dialog wählbar. Archivierte Träger
              bleiben an ihren Terminen stehen, werden aber nicht mehr angeboten.</span></div>
        )}
      </div>

      {edit && (
        <Modal title={edit.id ? 'Träger umbenennen' : 'Träger anlegen'}
          subtitle={edit.id ? 'Der neue Name gilt für alle Termine dieses Trägers.' : undefined}
          onClose={() => setEdit(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>Abbrechen</button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? 'Speichern …' : 'Speichern'}
            </button>
          </>}>
          <div className="field"><label>Name</label>
            <input className="input" value={edit.name} autoFocus placeholder="Kolpingsfamilie"
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></div>
          {err && <div className="err">{err}</div>}
        </Modal>
      )}
    </>
  );
}
