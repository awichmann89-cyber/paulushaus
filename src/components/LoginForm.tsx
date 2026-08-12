'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { doSignIn } from '@/lib/actions/auth';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
      {pending ? 'Anmelden …' : 'Anmelden'}
    </button>
  );
}

export function LoginForm() {
  const [error, action] = useActionState(doSignIn, undefined);
  return (
    <form action={action}>
      <div className="field">
        <label htmlFor="email">E-Mail</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="username" />
      </div>
      <div className="field">
        <label htmlFor="password">Passwort</label>
        <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <Submit />
      {error && <div className="err">{error}</div>}
    </form>
  );
}
