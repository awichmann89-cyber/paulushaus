import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { LoginForm } from '@/components/LoginForm';
import { IcoCal, IcoEye } from '@/components/Icons';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/');

  return (
    <div id="login" style={{ position: 'fixed', inset: 0, display: 'flex' }}>
      <div className="login-card">
        <div className="logo"><IcoCal s={28} /></div>
        <h1>Paulushaus</h1>
        <p className="sub">Raum- und Terminplanung</p>
        <LoginForm />
        <Link className="pub-link" href="/oeffentlich">
          <IcoEye s={14} /> Belegungsplan ohne Anmeldung ansehen
        </Link>
      </div>
    </div>
  );
}
