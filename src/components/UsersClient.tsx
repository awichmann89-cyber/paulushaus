'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { toast } from './Toast';
import { IcoInfo, IcoPlus } from './Icons';
import { niceStamp } from '@/lib/dates';
import { createUser, resendInvite, setUserRole, setUserShort, setUserStatus, updateUser } from '@/lib/actions/users';
import { shortOf } from '@/lib/calendar';

interface U {
  id: number; name: string; short: string; email: string; phone: string;
  role: 'ADMIN' | 'USER'; status: 'CONTACT' | 'INVITED' | 'ACTIVE' | 'DISABLED';
  lastLoginAt: string | null;
}

const EMPTY = { name: '', email: '', phone: '', role: 'USER' as 'ADMIN' | 'USER', account: true };

const STATUS: Record<U['status'], [string, string]> = {
  ACTIVE: ['Aktiv', 'ok'], INVITED: ['Eingeladen', 'wait'], CONTACT: ['Kontakt', 'user'], DISABLED: ['Gesperrt', 'no'],
};

export function UsersClient({ users, pending, meId }: { users: U[]; pending: number; meId: number }) {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  /** Person, deren Kontaktdaten gerade bearbeitet werden */
  const [edit, setEdit] = useState<U | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [link, setLink] = useState<{ link: string; sent: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [busy, start] = useTransition();

  const run = (fn: () => Promise<unknown>, msg: string) =>
    start(async () => {
      try { await fn(); router.refresh(); toast(msg); }
      catch (e) { setErr(e instanceof Error ? e.message : 'Aktion fehlgeschlagen.'); }
    });

  const close = () => { setModal(false); setEdit(null); setLink(null); setErr(''); };
  const openCreate = () => { setForm(EMPTY); setEdit(null); setLink(null); setErr(''); setModal(true); };
  const openEdit = (u: U) => {
    setForm({ ...EMPTY, name: u.name, email: u.email, phone: u.phone });
    setEdit(u); setLink(null); setErr(''); setModal(true);
  };

  const invite = (id: number) => start(async () => {
    setErr('');
    try {
      const r = await resendInvite(id);
      router.refresh();
      setEdit(null); setLink({ link: r.link, sent: r.sent }); setModal(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Einladung fehlgeschlagen.');
    }
  });

  const submit = () => {
    setErr('');
    start(async () => {
      try {
        if (edit) {
          await updateUser(edit.id, form);
          router.refresh(); close(); toast('Kontaktdaten gespeichert');
          return;
        }
        const res = await createUser(form);
        router.refresh();
        setForm(EMPTY);
        if (res.invite) {
          setLink(res.invite);
          toast(res.invite.sent ? 'Einladung verschickt' : 'Nutzer angelegt – Link kopieren');
        } else {
          close(); toast('Kontakt angelegt');
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
      }
    });
  };

  const accounts = users.filter((u) => u.status !== 'CONTACT').length;
  const admins = users.filter((u) => u.role === 'ADMIN' && u.status !== 'CONTACT').length;
  const ini = (n: string) => n.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  const needEmail = edit ? edit.status !== 'CONTACT' : form.account;

  return (
    <>
      <div className="ph">
        <div><h2>Nutzerverwaltung</h2><p>Accounts und Kontakte pflegen, Rollen vergeben, Zugriff steuern.</p></div>
        <button className="btn btn-primary" onClick={openCreate}>
          <IcoPlus /> Person anlegen
        </button>
      </div>

      <div className="pb">
        <div className="stats">
          <div className="stat"><small>Accounts</small><b>{accounts}</b></div>
          <div className="stat"><small>Kontakte ohne Zugang</small><b>{users.length - accounts}</b></div>
          <div className="stat"><small>Administratoren</small><b>{admins}</b></div>
          <div className="stat"><small>Offene Anfragen</small><b>{pending}</b></div>
        </div>

        {err && !modal && <div className="err" style={{ marginBottom: 14 }}>{err}</div>}

        <div className="card">
          <table>
            <thead>
              <tr><th>Name</th><th>Kontakt</th><th>Kürzel</th><th>Rolle</th><th>Status</th><th>Letzter Login</th><th /></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="person">
                      <div className={`avatar${u.role === 'USER' ? ' u' : ''}`}>{ini(u.name)}</div>
                      <span><b>{u.name}</b></span>
                    </div>
                  </td>
                  <td className="contact-cell">
                    {u.email ? <a href={`mailto:${u.email}`}>{u.email}</a> : null}
                    {u.phone ? <a href={`tel:${u.phone.replace(/[^0-9+]/g, '')}`}>{u.phone}</a> : null}
                    {!u.email && !u.phone && <span style={{ color: 'var(--text-3)' }}>–</span>}
                  </td>
                  <td>
                    {/* Erscheint als Ansprechperson auf den Monatslisten */}
                    <input className="input" style={{ padding: '5px 8px', width: 72, fontSize: 12.5 }}
                      defaultValue={u.short} placeholder={shortOf(u.name)} maxLength={8} disabled={busy}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== u.short) run(() => setUserShort(u.id, e.target.value), 'Kürzel gespeichert');
                      }} />
                  </td>
                  <td>
                    {u.status === 'CONTACT' ? <span style={{ color: 'var(--text-3)' }}>–</span> : (
                      <select className="input" style={{ padding: '5px 8px', width: 'auto', fontSize: 12.5 }}
                        value={u.role} disabled={busy || u.id === meId}
                        onChange={(e) => run(() => setUserRole(u.id, e.target.value as 'ADMIN' | 'USER'), 'Rolle geändert')}>
                        <option value="USER">Nutzer</option>
                        <option value="ADMIN">Administrator</option>
                      </select>
                    )}
                  </td>
                  <td><span className={`tag ${STATUS[u.status][1]}`}>{STATUS[u.status][0]}</span></td>
                  <td style={{ color: 'var(--text-2)' }}>{u.lastLoginAt ? niceStamp(u.lastLoginAt) : '–'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-ghost" disabled={busy} onClick={() => openEdit(u)}>Bearbeiten</button>
                      {(u.status === 'INVITED' || u.status === 'CONTACT') && (
                        <button className="btn btn-ghost" disabled={busy || !u.email}
                          title={u.email ? undefined : 'Zum Einladen wird eine E-Mail-Adresse gebraucht'}
                          onClick={() => invite(u.id)}>
                          {u.status === 'CONTACT' ? 'Zugang einladen' : 'Einladung erneut'}
                        </button>
                      )}
                      {u.id !== meId && (
                        u.status === 'DISABLED'
                          ? <button className="btn btn-ghost" disabled={busy}
                              onClick={() => run(() => setUserStatus(u.id, 'ACTIVE'), 'Entsperrt')}>Entsperren</button>
                          : <button className="btn btn-danger" disabled={busy}
                              onClick={() => run(() => setUserStatus(u.id, 'DISABLED'), 'Gesperrt')}>Sperren</button>
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
        <Modal title={link ? 'Einladung' : edit ? 'Kontaktdaten bearbeiten' : 'Person anlegen'}
          subtitle={link || edit ? undefined : form.account
            ? 'Der Account erhält eine Einladung per E-Mail.'
            : 'Die Person erscheint in der Kontaktliste und als Ansprechperson, kann sich aber nicht anmelden.'}
          onClose={close}
          footer={link
            ? <button className="btn btn-primary" onClick={close}>Fertig</button>
            : <>
                <button className="btn btn-ghost" onClick={close}>Abbrechen</button>
                <button className="btn btn-primary" onClick={submit} disabled={busy}>
                  {busy ? 'Speichern …' : edit ? 'Speichern' : form.account ? 'Einladung senden' : 'Kontakt anlegen'}
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
              {!edit && (
                <div className="field"><label>Zugang</label>
                  <div className="seg-mini">
                    <button className={form.account ? 'on' : ''} onClick={() => setForm({ ...form, account: true })}>Mit Account</button>
                    <button className={!form.account ? 'on' : ''} onClick={() => setForm({ ...form, account: false })}>Nur Kontakt</button>
                  </div>
                </div>
              )}
              <div className="field"><label>Name</label>
                <input className="input" value={form.name} autoFocus placeholder="Maria Schneider"
                  onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>E-Mail{needEmail ? '' : ' (optional)'}</label>
                <input className="input" type="email" value={form.email} placeholder="maria@verein.de"
                  onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="field"><label>Telefon (optional)</label>
                <input className="input" type="tel" value={form.phone} placeholder="0151 2345678"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              {!edit && form.account && (
                <div className="field"><label>Rolle</label>
                  <div className="seg-mini">
                    <button className={form.role === 'USER' ? 'on' : ''} onClick={() => setForm({ ...form, role: 'USER' })}>Nutzer</button>
                    <button className={form.role === 'ADMIN' ? 'on' : ''} onClick={() => setForm({ ...form, role: 'ADMIN' })}>Administrator</button>
                  </div>
                  <div className="hint"><IcoInfo s={13} />
                    <span>Nutzer stellen Anfragen. Admins tragen direkt ein, geben frei und verwalten Accounts.</span></div>
                </div>
              )}
              {err && <div className="err">{err}</div>}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
