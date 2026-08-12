import { auth } from '@/lib/auth';
import { getRequests, getRooms } from '@/lib/data';
import { findConflicts } from '@/lib/actions/bookings';
import { RequestList } from '@/components/RequestList';

export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  const session = await auth();
  const admin = session?.user.role === 'ADMIN';
  const [rooms, list] = await Promise.all([
    getRooms(),
    getRequests(admin ? undefined : Number(session!.user.id)),
  ]);

  const withConflicts = await Promise.all(list.map(async (e) => ({
    ev: e,
    conflicts: admin
      ? await findConflicts({
          id: e.id, roomId: e.roomId, title: e.title,
          startDate: e.startDate, endDate: e.endDate,
          startTime: e.startTime, endTime: e.endTime,
          spanMode: e.spanMode, attendees: e.attendees,
        })
      : [],
  })));

  return (
    <>
      <div className="ph">
        <div>
          <h2>{admin ? 'Terminanfragen' : 'Meine Anfragen'}</h2>
          <p>{admin
            ? 'Offene Anfragen von Nutzern – annehmen oder ablehnen. Konflikte werden automatisch geprüft.'
            : 'Deine offenen Anfragen, die noch auf Freigabe warten.'}</p>
        </div>
      </div>
      <div className="pb">
        <div className="card">
          <RequestList items={withConflicts} rooms={rooms} admin={admin} />
        </div>
      </div>
    </>
  );
}
