import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getMonthBookings, getRooms } from '@/lib/data';
import { dayLabel, sheetRows } from '@/lib/sheet';
import { MON, niceStamp } from '@/lib/dates';
import { PrintSheets, type PrintSheet } from '@/components/PrintSheets';

export const dynamic = 'force-dynamic';

export default async function PrintPage({
  searchParams,
}: { searchParams: Promise<{ month?: string; rooms?: string; auto?: string }> }) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : new Date().toISOString().slice(0, 7);
  const all = await getRooms();
  const ids = (sp.rooms ?? '').split(',').map(Number).filter((n) => !Number.isNaN(n) && n > 0);
  const chosen = ids.length ? all.filter((r) => ids.includes(r.id)) : all;

  const sheets: PrintSheet[] = await Promise.all(chosen.map(async (room) => {
    const events = await getMonthBookings(room.id, month);
    return {
      id: room.id, name: room.name, color: room.color, count: events.length,
      sub: `Belegungsplan ${MON[Number(month.slice(5)) - 1]} ${month.slice(0, 4)} · ${room.groupName} · ${room.capacity} Plätze`,
      rows: sheetRows(events, month).map((r) => ({
        day: r.day, dayText: dayLabel(r.day), time: r.time, title: r.ev.title,
        multi: r.multi, daily: !r.multi && r.ev.spanMode === 'DAILY', contact: r.ev.contactShort ?? '',
      })),
    };
  }));

  return (
    <div className="print-page">
      <PrintSheets sheets={sheets} stand={niceStamp(new Date())} autoPrint={sp.auto === '1'} />
    </div>
  );
}
