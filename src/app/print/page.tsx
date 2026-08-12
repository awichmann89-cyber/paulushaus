import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getMonthBookings, getRooms } from '@/lib/data';
import { dayLabel, sheetRows } from '@/lib/sheet';
import { MON, niceStamp, plural } from '@/lib/dates';
import { AutoPrint } from '@/components/AutoPrint';

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
  const now = new Date();

  const sheets = await Promise.all(chosen.map(async (room) => {
    const events = await getMonthBookings(room.id, month);
    return { room, rows: sheetRows(events, month), count: events.length };
  }));

  return (
    <div className="print-page">
      {sp.auto === '1' && <AutoPrint />}
      <div id="printArea">
        {sheets.map(({ room, rows, count }) => {
          let last = '';
          return (
            <div className="sheet" key={room.id}>
              <div className="sheet-head">
                <div>
                  <h1>{room.name}</h1>
                  <p>Belegungsplan {MON[Number(month.slice(5)) - 1]} {month.slice(0, 4)} · {room.groupName} · {room.capacity} Plätze</p>
                </div>
                <div className="sheet-mark" style={{ background: room.color }} />
              </div>
              <table className="sheet-table">
                <thead>
                  <tr><th>Tag</th><th>Uhrzeit</th><th>Belegung</th><th>Pers.</th><th>Verantwortlich</th></tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="empty">Keine Termine in diesem Monat.</td></tr>
                  )}
                  {rows.map((r, i) => {
                    const head = r.day !== last ? dayLabel(r.day) : '';
                    last = r.day;
                    return (
                      <tr key={i} className={head ? 'new-day' : ''}>
                        <td className="d">{head}</td>
                        <td className="t">{r.time}</td>
                        <td>{r.ev.title}
                          {r.multi && <span className="mtag">durchgehend</span>}
                          {!r.multi && r.ev.spanMode === 'DAILY' && <span className="mtag">Serie</span>}
                        </td>
                        <td className="p">{r.ev.attendees || '–'}</td>
                        <td className="o">{r.ev.createdBy ?? '–'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="sheet-foot">
                <span>Paulushaus Raumplaner · Stand {niceStamp(now)}</span>
                <span>{plural(count, 'Termin', 'Termine')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
