import { auth } from '@/lib/auth';
import { getBookings, getCarriers, getContacts, getRooms, rangeFor } from '@/lib/data';
import { CalendarClient } from '@/components/CalendarClient';
import { iso, parseISO } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: { searchParams: Promise<{ d?: string; v?: string }> }) {
  const sp = await searchParams;
  const session = await auth();
  const today = new Date();
  const cursor = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : iso(today);
  const view = ['day', 'week', 'month', 'rooms'].includes(sp.v ?? '') ? sp.v! : 'week';

  const { from, to } = rangeFor(view, parseISO(cursor));
  const admin = session?.user.role === 'ADMIN';
  const [rooms, events, contacts, carriers] = await Promise.all([
    getRooms(), getBookings(from, to), admin ? getContacts() : [], getCarriers(),
  ]);

  return (
    <CalendarClient
      events={events}
      rooms={rooms}
      contacts={contacts}
      carriers={carriers}
      admin={admin}
      cursor={cursor}
      view={view}
      today={iso(today)}
    />
  );
}
