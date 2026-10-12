import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPendingCount, getUsers } from '@/lib/data';
import { UsersClient } from '@/components/UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');
  const [list, pending] = await Promise.all([getUsers(), getPendingCount()]);

  return (
    <UsersClient
      users={list.map((u) => ({
        id: u.id, name: u.name, short: u.short ?? '', email: u.email ?? '', phone: u.phone ?? '',
        role: u.role, status: u.status,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      }))}
      pending={pending}
      meId={Number(session.user.id)}
    />
  );
}
