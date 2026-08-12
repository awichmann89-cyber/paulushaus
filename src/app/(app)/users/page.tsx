import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPendingCount, getRooms, getUsers } from '@/lib/data';
import { UsersClient } from '@/components/UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');
  const [list, rooms, pending] = await Promise.all([getUsers(), getRooms(), getPendingCount()]);

  return (
    <UsersClient
      users={list.map((u) => ({
        id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      }))}
      roomCount={rooms.length}
      pending={pending}
      meId={Number(session.user.id)}
    />
  );
}
