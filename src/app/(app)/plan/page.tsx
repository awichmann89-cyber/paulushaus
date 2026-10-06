import { redirect } from 'next/navigation';
import { isNotNull, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getRooms } from '@/lib/data';
import { db, bookings } from '@/lib/db';
import { PlanClient } from '@/components/PlanClient';

export const dynamic = 'force-dynamic';
/** Import einer Jahresliste: Datei lesen, ~2000 Termine schreiben */
export const maxDuration = 60;

export default async function PlanPage() {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  const [rooms, imports] = await Promise.all([
    getRooms(),
    db.select({
      tag: bookings.importSource,
      n: sql<number>`count(*)::int`,
      at: sql<string>`max(${bookings.createdAt})`,
    }).from(bookings).where(isNotNull(bookings.importSource)).groupBy(bookings.importSource),
  ]);

  return (
    <PlanClient
      thisYear={new Date().getFullYear()}
      rooms={rooms.map((r) => ({ id: r.id, name: r.name, color: r.color, planSheet: r.planSheet ?? null }))}
      imports={imports
        .map((i) => ({ tag: i.tag!, count: i.n, at: new Date(i.at).toISOString() }))
        .sort((a, b) => a.tag.localeCompare(b.tag))}
    />
  );
}
