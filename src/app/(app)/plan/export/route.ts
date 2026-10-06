import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db, bookings, rooms } from '@/lib/db';
import { buildPlanWorkbook } from '@/lib/plan/write';
import { iso } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** Excel-Belegungsplan eines Jahres: /plan/export?year=2026 */
export async function GET(req: Request) {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') return new Response('Nur für Administratoren.', { status: 403 });

  const year = Number(new URL(req.url).searchParams.get('year'));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return new Response('Ungültiges Jahr.', { status: 400 });
  }

  const [roomList, rows] = await Promise.all([
    db.select({ id: rooms.id, name: rooms.name, color: rooms.color, planSheet: rooms.planSheet })
      .from(rooms).where(eq(rooms.isActive, true)).orderBy(asc(rooms.sortOrder), asc(rooms.name)),
    db.select({
      roomId: bookings.roomId, title: bookings.title, note: bookings.note,
      startDate: bookings.startDate, endDate: bookings.endDate,
      startTime: bookings.startTime, endTime: bookings.endTime, spanMode: bookings.spanMode,
    }).from(bookings).where(and(
      eq(bookings.status, 'CONFIRMED'),
      lte(bookings.startDate, `${year}-12-31`), gte(bookings.endDate, `${year}-01-01`),
    )).orderBy(asc(bookings.startDate), asc(bookings.startTime)),
  ]);

  const wb = buildPlanWorkbook(year, roomList, rows);
  const buf = await wb.xlsx.writeBuffer();
  const stamp = iso(new Date()).slice(2).replace(/-/g, '');
  const name = `${year}_PaulusHaus BELEGUNGSPLAN_Stand ${stamp}.xlsx`;

  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
