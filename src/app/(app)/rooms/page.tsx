import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getGroups, getRooms, groupRooms } from '@/lib/data';
import { RoomsClient } from '@/components/RoomsClient';
import { db, bookings } from '@/lib/db';
import { and, gte, lte, eq, sql } from 'drizzle-orm';
import { iso, ymOf } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  const today = new Date();
  const month = ymOf(today);
  const from = `${month}-01`;
  const to = iso(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const [rooms, groups, counts] = await Promise.all([
    getRooms(),
    getGroups(),
    db.select({ roomId: bookings.roomId, n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.status, 'CONFIRMED'), lte(bookings.startDate, to), gte(bookings.endDate, from)))
      .groupBy(bookings.roomId),
  ]);

  return (
    <RoomsClient
      groups={groupRooms(rooms)}
      allGroups={groups.map((g) => ({ id: g.id, name: g.name }))}
      counts={Object.fromEntries(counts.map((c) => [c.roomId, c.n]))}
      monthLabel={month}
    />
  );
}
