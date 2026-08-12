'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvite } from '@/lib/actions/users';

export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const submit = () => {
    setErr('');
    if (pw !== pw2) { setErr('Die beiden Passwörter stimmen nicht überein.'); return; }
    start(async () => {
      try {
        await acceptInvite(token, pw);
        setDone(true);
        setTimeout(() => router.push('/login'), 1500);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
      }
    });
  };

  if (done) return <div className="ok-msg">Passwort gespeichert. Du wirst zur Anmeldung weitergeleitet …</div>;

  return (
    <>
      <div className="field">
        <label>Neues Passwort</label>
        <input className="input" type="password" value={pw} autoComplete="new-password"
          onChange={(e) => setPw(e.target.value)} />
      </div>
      <div className="field">
        <label>Passwort wiederholen</label>
        <input className="input" type="password" value={pw2} autoComplete="new-password"
          onChange={(e) => setPw2(e.target.value)} />
      </div>
      <button className="btn btn-primary btn-block" onClick={submit} disabled={pending}>
        {pending ? 'Speichern …' : 'Passwort festlegen'}
      </button>
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>Mindestens 10 Zeichen.</p>
      {err && <div className="err">{err}</div>}
    </>
  );
}
