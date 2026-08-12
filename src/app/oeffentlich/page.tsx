import { getBookings, getRooms, rangeFor } from '@/lib/data';
import { PublicCalendar } from '@/components/PublicCalendar';
import { iso, parseISO } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Raumbelegung · Paulushaus' };

export default async function PublicPage({
  searchParams,
}: { searchParams: Promise<{ d?: string; v?: string; kiosk?: string }> }) {
  const sp = await searchParams;
  const today = new Date();
  const cursor = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : iso(today);
  const view = ['day', 'week', 'month', 'rooms'].includes(sp.v ?? '') ? sp.v! : 'week';

  const { from, to } = rangeFor(view, parseISO(cursor));
  const rooms = await getRooms(true);
  const all = await getBookings(from, to, { confirmedOnly: true });
  const allowed = new Set(rooms.map((r) => r.id));

  /* Nur Raum und Zeitraum verlassen den Server – keine Titel, keine Namen, keine Notizen */
  const events = all.filter((e) => allowed.has(e.roomId)).map((e) => ({
    id: e.id, roomId: e.roomId, title: 'Belegt', note: null,
    startDate: e.startDate, endDate: e.endDate,
    startTime: e.startTime, endTime: e.endTime,
    spanMode: e.spanMode, status: 'CONFIRMED' as const,
    attendees: 0, createdBy: null, createdById: null, updatedAt: '',
  }));

  return (
    <PublicCalendar
      events={events} rooms={rooms} cursor={cursor} view={view}
      today={iso(today)} kiosk={sp.kiosk === '1'}
    />
  );
}
