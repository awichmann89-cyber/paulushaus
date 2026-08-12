import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getExportStatus, getPendingCount, getRooms, groupRooms } from '@/lib/data';
import { AppShell } from '@/components/AppShell';
import { TopbarSlot } from '@/components/TopbarSlot';
import { iso, ymOf } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const admin = session.user.role === 'ADMIN';
  const me = Number(session.user.id);

  const today = new Date();
  const [rooms, pending] = await Promise.all([
    getRooms(),
    getPendingCount(admin ? undefined : me),
  ]);
  const stale = admin
    ? (await getExportStatus(ymOf(today))).filter((r) => r.changes && r.changes.length).length
    : 0;

  return (
    <AppShell
      user={{ name: session.user.name ?? 'Unbekannt', role: session.user.role }}
      groups={groupRooms(rooms)}
      pending={pending}
      stale={stale}
      today={iso(today)}
      topbar={<TopbarSlot today={iso(today)} />}
    >
      {children}
    </AppShell>
  );
}
