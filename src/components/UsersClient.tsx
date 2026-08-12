'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { toast } from './Toast';
import { IcoInfo, IcoPlus } from './Icons';
import { niceStamp } from '@/lib/dates';
import { inviteUser, resendInvite, setUserRole, setUserStatus } from '@/lib/actions/users';

interface U {
  id: number; name: string; email: string;
  role: 'ADMIN' | 'USER'; status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  lastLoginAt: string | null;
}

export function UsersClient({ users, roomCount, pending, meId }: {
  users: U[]; roomCount: number; pending: number; meId: number;
}) {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'USER' as 'ADMIN' | 'USER' });
  const [link, setLink] = useState<{ link: string; sent: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [busy, start] = useTransition();

  const run = (fn: () => Promise<unknown>, msg: string) =>
    start(async () => {
      try { await fn(); router.refresh(); toast(msg); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'); }
    });

  const submit = () => {
    setErr('');
    start(async () => {
      try {
        const res = await inviteUser(form);
        router.refresh();
        setLink({ link: res.link, sent: res.sent });
        setForm({ name: '', email: '', role: 'USER' });
        toast(res.sent ? `Einladung an ${res.link.includes('@') ? '' : ''}verschickt` : 'Nutzer angelegt – Link kopieren');
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Anlegen fehlgeschlagen.');
      }
    });
  };

  const admins = users.filter((u) => u.role === 'ADMIN').length;
  const ini = (n: string) => n.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      <div className="ph">
        <div><h2>Nutzerverwaltung</h2><p>Accounts anlegen, Rollen vergeben, Zugriff steuern.</p></div>
        <button className="btn btn-primary" onClick={() => { setModal(true); setLink(null); setErr(''); }}>
          <IcoPlus /> Nutzer anlegen
        </button>
      </div>

      <div className="pb">
        <div className="stats">
          <div className="stat"><small>Accounts</small><b>{users.length}</b></div>
          <div className="stat"><small>Administratoren</small><b>{admins}</b></div>
          <div className="stat"><small>Räume</small><b>{roomCount}</b></div>
          <div className="stat"><small>Offene Anfragen</small><b>{pending}</b></div>
        </div>

        {err && <div className="err" style={{ marginBottom: 14 }}>{err}</div>}

        <div className="card">
          <table>
            <thead>
              <tr><th>Nutzer</th><th>Rolle</th><th>Status</th><th>Letzter Login</th><th /></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="person">
                      <div className={`avatar${u.role === 'USER' ? ' u' : ''}`}>{ini(u.name)}</div>
                      <span><b>{u.name}</b><small>{u.email}</small></span>
                    </div>
                  </td>
                  <td>
                    <select className="input" style={{ padding: '5px 8px', width: 'auto', fontSize: 12.5 }}
                      value={u.role} disabled={busy || u.id === meId}
                      onChange={(e) => run(() => setUserRole(u.id, e.target.value as 'ADMIN' | 'USER'), 'Rolle geändert')}>
                      <option value="USER">Nutzer</option>
                      <option value="ADMIN">Administrator</option>
                    </select>
                  </td>
                  <td>
                    <span className={`tag ${u.status === 'ACTIVE' ? 'ok' : u.status === 'INVITED' ? 'wait' : 'no'}`}>
                      {u.status === 'ACTIVE' ? 'Aktiv' : u.status === 'INVITED' ? 'Eingeladen' : 'Gesperrt'}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-2)' }}>{u.lastLoginAt ? niceStamp(u.lastLoginAt) : '–'}</td>
                  <td>
                    <div className="row-actions">
                      {u.status === 'INVITED' && (
                        <button className="btn btn-ghost" disabled={busy}
                          onClick={() => start(async () => {
                            const r = await resendInvite(u.id);
                            setLink({ link: r.link, sent: r.sent });
                            setModal(true);
                          })}>Einladung erneut</button>
                      )}
                      {u.id !== meId && (
                        u.status === 'DISABLED'
                          ? <button className="btn btn-ghost" disabled={busy}
                              onClick={() => run(() => setUserStatus(u.id, 'ACTIVE'), 'Zugang entsperrt')}>Entsperren</button>
                          : <button className="btn btn-danger" disabled={busy}
                              onClick={() => run(() => setUserStatus(u.id, 'DISABLED'), 'Zugang gesperrt')}>Sperren</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title={link ? 'Einladung' : 'Nutzer anlegen'}
          subtitle={link ? undefined : 'Der Account erhält eine Einladung per E-Mail.'}
          onClose={() => { setModal(false); setLink(null); }}
          footer={link
            ? <button className="btn btn-primary" onClick={() => { setModal(false); setLink(null); }}>Fertig</button>
            : <>
                <button className="btn btn-ghost" onClick={() => setModal(false)}>Abbrechen</button>
                <button className="btn btn-primary" onClick={submit} disabled={busy}>
                  {busy ? 'Senden …' : 'Einladung senden'}
                </button>
              </>}>
          {link ? (
            <>
              <div className={link.sent ? 'ok-msg' : 'err'}>
                {link.sent
                  ? 'Die Einladung wurde per E-Mail verschickt.'
                  : 'Es konnte keine E-Mail verschickt werden (RESEND_API_KEY fehlt oder Versand schlug fehl). Bitte den Link manuell weitergeben:'}
              </div>
              <div className="invite-box">{link.link}</div>
              <button className="btn btn-ghost" style={{ marginTop: 10 }}
                onClick={() => { navigator.clipboard?.writeText(link.link); toast('Link kopiert'); }}>
                Link kopieren
              </button>
            </>
          ) : (
            <>
              <div className="field"><label>Name</label>
                <input className="input" value={form.name} autoFocus placeholder="Maria Schneider"
                  onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>E-Mail</label>
                <input className="input" type="email" value={form.email} placeholder="maria@verein.de"
                  onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="field"><label>Rolle</label>
                <div className="seg-mini">
                  <button className={form.role === 'USER' ? 'on' : ''} onClick={() => setForm({ ...form, role: 'USER' })}>Nutzer</button>
                  <button className={form.role === 'ADMIN' ? 'on' : ''} onClick={() => setForm({ ...form, role: 'ADMIN' })}>Administrator</button>
                </div>
                <div className="hint"><IcoInfo s={13} />
                  <span>Nutzer stellen Anfragen. Admins tragen direkt ein, geben frei und verwalten Accounts.</span></div>
              </div>
              {err && <div className="err">{err}</div>}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
