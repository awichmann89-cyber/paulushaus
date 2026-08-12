'use client';

import { useEffect, useState } from 'react';

/** Aktuelle Uhrzeit im Browser des Betrachters – aktualisiert sich jede halbe Minute.
 *  Bewusst clientseitig: die rote Jetzt-Linie und die Aushang-Uhr sollen die
 *  Ortszeit des Betrachters zeigen, nicht die Zeitzone des Servers. */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
