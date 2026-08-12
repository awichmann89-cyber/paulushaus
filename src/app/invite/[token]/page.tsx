import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { InviteForm } from '@/components/InviteForm';
import { IcoCal } from '@/components/Icons';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [u] = await db.select().from(users).where(eq(users.inviteToken, token)).limit(1);
  const expired = !!u?.inviteExpiresAt && u.inviteExpiresAt < new Date();

  return (
    <div className="center-page">
      <div className="login-card">
        <div className="logo"><IcoCal s={28} /></div>
        <h1>Zugang aktivieren</h1>
        {!u || expired ? (
          <>
            <p className="sub">Dieser Einladungslink ist {expired ? 'abgelaufen' : 'ungültig'}.</p>
            <div className="err">Bitte melde dich bei der Hausverwaltung, damit eine neue Einladung verschickt wird.</div>
          </>
        ) : (
          <>
            <p className="sub">Hallo {u.name} – bitte lege ein Passwort fest.</p>
            <InviteForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
