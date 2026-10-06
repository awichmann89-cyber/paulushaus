import { auth } from '@/lib/auth';
import { getRequests, getRooms } from '@/lib/data';
import { conflictsFor } from '@/lib/conflicts';
import { RequestList } from '@/components/RequestList';

export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  const session = await auth();
  const admin = session?.user.role === 'ADMIN';
  const [rooms, list] = await Promise.all([
    getRooms(),
    getRequests(admin ? undefined : Number(session!.user.id)),
  ]);

  /* Termine einer Serienanfrage zu einem Eintrag bündeln – sortiert ist schon nach Datum,
     also ist der erste gefundene auch der erste Termin der Serie */
  const groups = new Map<string, typeof list>();
  for (const e of list) {
    const key = e.seriesId ? `s${e.seriesId}` : `b${e.id}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  const withConflicts = await Promise.all([...groups.values()].map(async (evs) => ({
    ev: evs[0],
    count: evs.length,
    last: evs[evs.length - 1].startDate,
    conflicts: admin ? await conflictsFor(evs, evs.map((e) => e.id)) : [],
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
