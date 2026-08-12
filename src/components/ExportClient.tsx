'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { toast } from './Toast';
import { IcoDown } from './Icons';
import { MON, niceStamp, plural } from '@/lib/dates';
import { recordExport } from '@/lib/actions/exports';

interface Row {
  roomId: number; name: string; color: string; groupName: string;
  count: number; exportedAt: string | null;
  changes: { title: string; startDate: string; startTime: string; deleted: boolean }[] | null;
}

export function ExportClient({ month, rows }: { month: string; rows: Row[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [preview, setPreview] = useState<number[] | null>(null);
  const [err, setErr] = useState('');

  const stale = useMemo(() => new Set(rows.filter((r) => !r.changes || r.changes.length).map((r) => r.roomId)), [rows]);
  const [checked, setChecked] = useState<Set<number>>(stale);

  const groups = useMemo(() => {
    const out: { name: string; rows: Row[] }[] = [];
    for (const r of rows) {
      let g = out.find((x) => x.name === r.groupName);
      if (!g) { g = { name: r.groupName, rows: [] }; out.push(g); }
      g.rows.push(r);
    }
    return out;
  }, [rows]);

  const monthName = `${MON[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
  const printUrl = (ids: number[], auto = false) =>
    `/print?month=${month}&rooms=${ids.join(',')}${auto ? '&auto=1' : ''}`;

  const doPrint = (ids: number[]) =>
    start(async () => {
      try {
        await recordExport(ids, month);
        setPreview(null);
        router.refresh();
        toast(`${plural(ids.length, 'Liste', 'Listen')} exportiert – Stand ${niceStamp(new Date())}`);
        window.open(printUrl(ids, true), '_blank', 'noopener');
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Export fehlgeschlagen.');
      }
    });

  return (
    <>
      <div className="ph">
        <div><h2>Monatslisten exportieren</h2>
          <p>Pro Raum eine Liste für den ganzen Monat – einzeln oder alle ausgewählten zusammen als PDF.</p></div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: 'var(--text-2)', margin: '0 0 5px 2px', fontWeight: 500 }}>Monat</label>
            <input className="input" type="month" value={month} style={{ width: 170 }}
              onChange={(e) => router.push(`/export?m=${e.target.value}`)} />
          </div>
          <button className="btn btn-primary" disabled={busy || !checked.size}
            onClick={() => setPreview([...checked])}>
            <IcoDown s={15} /> Ausgewählte als PDF
          </button>
        </div>
      </div>

      <div className="pb">
        <div className="exp-note">
          <span style={{ fontWeight: 600 }}>{monthName}</span>
          <span>Ausgewählt sind standardmäßig alle Räume, deren Liste seit dem letzten Export nicht mehr aktuell ist.</span>
        </div>
        {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}

        {groups.map((g) => (
          <div key={g.name}>
            <div className="grp-title"><b>{g.name}</b><small>{plural(g.rows.length, 'Raum', 'Räume')}</small></div>
            <div className="card">
              {g.rows.map((r) => {
                const status = !r.exportedAt
                  ? <span className="tag wait">Noch nie exportiert</span>
                  : r.changes && r.changes.length
                    ? <span className="tag no">{plural(r.changes.length, 'Änderung', 'Änderungen')} seit Export</span>
                    : <span className="tag ok">Export aktuell</span>;
                return (
                  <div className="exp-row" key={r.roomId}>
                    <label className="exp-check">
                      <input type="checkbox" checked={checked.has(r.roomId)}
                        onChange={() => setChecked((c) => {
                          const n = new Set(c); if (n.has(r.roomId)) n.delete(r.roomId); else n.add(r.roomId); return n;
                        })} />
                    </label>
                    <span style={{ background: r.color, width: 11, height: 11, borderRadius: 3, flex: 'none' }} />
                    <div className="exp-main">
                      <b>{r.name}</b>
                      <small>{plural(r.count, 'Termin', 'Termine')} im Monat · zuletzt exportiert: {r.exportedAt ? niceStamp(r.exportedAt) : '–'}</small>
                      {r.changes && r.changes.length > 0 && (
                        <div className="exp-diff">
                          {r.changes.slice(0, 4).map((c, i) => (
                            <span key={i}>
                              {c.deleted ? 'abgesagt' : 'geändert'}: {c.title} · {c.startDate.slice(8)}.{c.startDate.slice(5, 7)}. {c.startTime.slice(0, 5)}
                            </span>
                          ))}
                          {r.changes.length > 4 && <span>… und {r.changes.length - 4} weitere</span>}
                        </div>
                      )}
                    </div>
                    {status}
                    <button className="btn btn-ghost" onClick={() => setPreview([r.roomId])}>Vorschau / PDF</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <Modal
          title={`Belegungsliste ${monthName}`}
          subtitle={`${plural(preview.length, 'Raum-Liste', 'Raum-Listen')} · so wird gedruckt bzw. als PDF gespeichert`}
          width={800}
          onClose={() => setPreview(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>Abbrechen</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => doPrint(preview)}>
              {busy ? 'Wird vorbereitet …' : 'Als PDF speichern / drucken'}
            </button>
          </>}>
          <iframe src={printUrl(preview)} title="Vorschau"
            style={{ width: '100%', height: '52vh', border: 'none', borderRadius: 12, background: 'rgba(120,120,128,.09)' }} />
        </Modal>
      )}
    </>
  );
}
