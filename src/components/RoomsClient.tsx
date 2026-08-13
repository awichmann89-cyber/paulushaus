'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { toast } from './Toast';
import { IcoInfo, IcoPlus } from './Icons';
import { PALETTE, type GroupView, type RoomView } from '@/lib/calendar';
import { MON, plural } from '@/lib/dates';
import { archiveRoom, saveGroup, saveRoom } from '@/lib/actions/rooms';

export function RoomsClient({ groups, allGroups, counts, monthLabel }: {
  groups: GroupView[];
  allGroups: { id: number; name: string }[];
  counts: Record<number, number>;
  monthLabel: string;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<RoomView> | null>(null);
  const [groupModal, setGroupModal] = useState<{ id: number | null; name: string } | null>(null);
  const [newGroup, setNewGroup] = useState('');
  const [err, setErr] = useState('');
  const [busy, start] = useTransition();
  const monthName = `${MON[Number(monthLabel.slice(5)) - 1]}`;

  const submit = () => {
    if (!edit) return;
    setErr('');
    const color = (edit.color ?? '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      setErr('Bitte eine gültige Farbe wählen (Hex-Code z. B. #4A90D9).');
      return;
    }
    start(async () => {
      try {
        await saveRoom({
          id: edit.id,
          name: edit.name ?? '',
          color,
          capacity: edit.capacity ?? 0,
          equipment: edit.equipment ?? '',
          groupId: newGroup ? null : (edit.groupId ?? null),
          newGroupName: newGroup || undefined,
          isPublic: edit.isPublic ?? true,
        });
        setEdit(null); setNewGroup(''); router.refresh();
        toast(edit.id ? 'Raum gespeichert' : `Raum „${edit.name}“ angelegt – Kalender aktiv`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
      }
    });
  };

  return (
    <>
      <div className="ph">
        <div><h2>Räume &amp; Kalender</h2>
          <p>Jeder Raum ist ein eigener Kalender mit fester Farbe im Gesamtkalender.</p></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setGroupModal({ id: null, name: '' })}>Gruppe anlegen</button>
          <button className="btn btn-primary" onClick={() => {
            setEdit({ name: '', color: PALETTE[0], capacity: 20, equipment: '', groupId: allGroups[0]?.id ?? null, isPublic: true });
            setNewGroup(''); setErr('');
          }}><IcoPlus /> Raum anlegen</button>
        </div>
      </div>

      <div className="pb">
        {!groups.length && (
          <div className="card"><div className="empty-state">
            Noch keine Räume angelegt. Lege zuerst eine Gruppe (z. B. „Erdgeschoss“) und dann Räume an.
          </div></div>
        )}
        {groups.map((g) => (
          <div key={g.id}>
            <div className="grp-title">
              <b>{g.name}</b><small>{plural(g.rooms.length, 'Raum', 'Räume')}</small>
              {g.id > 0 && (
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }}
                  onClick={() => setGroupModal({ id: g.id, name: g.name })}>Gruppe bearbeiten</button>
              )}
            </div>
            <div className="rooms-grid">
              {g.rooms.map((r) => (
                <div className="room-card" key={r.id} style={{ ['--c' as string]: r.color }}>
                  <h4>{r.name}</h4>
                  <div className="rm"><span>{r.capacity} Plätze</span><span>{g.name}</span></div>
                  {r.equipment && <div className="rm" style={{ marginTop: 6, color: 'var(--text-3)' }}>{r.equipment}</div>}
                  <div className="rm" style={{ marginTop: 10, gap: 6 }}>
                    <span className="tag ok">{plural(counts[r.id] ?? 0, 'Termin', 'Termine')} im {monthName}</span>
                    {!r.isPublic && <span className="tag no">nicht öffentlich</span>}
                  </div>
                  <div className="swatches">
                    {PALETTE.map((c) => (
                      <span key={c} className={`sw-dot${c === r.color ? ' on' : ''}`} style={{ background: c }} />
                    ))}
                  </div>
                  <div className="row-actions" style={{ marginTop: 12 }}>
                    <button className="btn btn-ghost" onClick={() => { setEdit(r); setNewGroup(''); setErr(''); }}>Bearbeiten</button>
                    <button className="btn btn-danger" disabled={busy}
                      onClick={() => start(async () => { await archiveRoom(r.id); router.refresh(); toast('Raum archiviert'); })}>
                      Archivieren
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {edit && (
        <Modal title={edit.id ? 'Raum bearbeiten' : 'Raum anlegen'}
          subtitle="Legt automatisch einen eigenen Kalender mit dieser Farbe an."
          onClose={() => setEdit(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>Abbrechen</button>
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Speichern …' : edit.id ? 'Speichern' : 'Raum anlegen'}
            </button>
          </>}>
          <div className="field"><label>Raumname</label>
            <input className="input" value={edit.name ?? ''} autoFocus placeholder="z. B. Werkraum"
              onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div className="grid2">
            <div className="field"><label>Plätze</label>
              <input className="input" type="number" min={0} value={edit.capacity ?? 0}
                onChange={(e) => setEdit({ ...edit, capacity: Number(e.target.value) })} /></div>
            <div className="field"><label>Gruppe / Etage</label>
              <select className="input" value={newGroup ? '__new' : String(edit.groupId ?? '')}
                onChange={(e) => {
                  if (e.target.value === '__new') setNewGroup('Neue Gruppe');
                  else { setNewGroup(''); setEdit({ ...edit, groupId: Number(e.target.value) }); }
                }}>
                {allGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                <option value="__new">+ Neue Gruppe …</option>
              </select></div>
          </div>
          {newGroup && (
            <div className="field"><label>Name der neuen Gruppe</label>
              <input className="input" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} /></div>
          )}
          <div className="field"><label>Ausstattung</label>
            <input className="input" value={edit.equipment ?? ''} placeholder="Beamer, Whiteboard …"
              onChange={(e) => setEdit({ ...edit, equipment: e.target.value })} /></div>
          <div className="field"><label>Kalenderfarbe</label>
            <div className="color-pick">
              {PALETTE.map((c) => (
                <button key={c} className={`sw-dot${edit.color === c ? ' on' : ''}`}
                  style={{ background: c, width: 26, height: 26 }} onClick={() => setEdit({ ...edit, color: c })} />
              ))}
              <label className={`sw-dot custom${edit.color && !PALETTE.includes(edit.color) ? ' on' : ''}`}
                style={{ width: 26, height: 26, background: edit.color && !PALETTE.includes(edit.color) ? edit.color : undefined }}
                title="Eigene Farbe wählen">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(edit.color ?? '') ? edit.color : PALETTE[0]}
                  onChange={(e) => setEdit({ ...edit, color: e.target.value })} />
              </label>
            </div>
            <input className="input" style={{ marginTop: 8, maxWidth: 140, fontVariantNumeric: 'tabular-nums' }}
              value={edit.color ?? ''} placeholder="#RRGGBB" maxLength={7}
              onChange={(e) => setEdit({ ...edit, color: e.target.value })} />
          </div>
          <div className="field"><label>Öffentliche Ansicht</label>
            <div className="seg-mini">
              <button className={edit.isPublic !== false ? 'on' : ''} onClick={() => setEdit({ ...edit, isPublic: true })}>Anzeigen</button>
              <button className={edit.isPublic === false ? 'on' : ''} onClick={() => setEdit({ ...edit, isPublic: false })}>Verbergen</button>
            </div>
            <div className="hint"><IcoInfo s={13} />
              <span>Verborgene Räume erscheinen nicht im öffentlichen Belegungsplan – z. B. interne Besprechungsräume.</span></div>
          </div>
          {err && <div className="err">{err}</div>}
        </Modal>
      )}

      {groupModal && (
        <Modal title={groupModal.id ? 'Gruppe bearbeiten' : 'Gruppe anlegen'}
          subtitle="Gruppen bündeln Räume – Etagen, Gebäudeteile oder Außenflächen."
          onClose={() => setGroupModal(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setGroupModal(null)}>Abbrechen</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => start(async () => {
              try {
                await saveGroup(groupModal.id, groupModal.name);
                setGroupModal(null); router.refresh(); toast('Gruppe gespeichert');
              } catch (e) { setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.'); }
            })}>Speichern</button>
          </>}>
          <div className="field"><label>Name</label>
            <input className="input" autoFocus value={groupModal.name}
              onChange={(e) => setGroupModal({ ...groupModal, name: e.target.value })}
              placeholder="z. B. 1. Obergeschoss" /></div>
        </Modal>
      )}
    </>
  );
}
