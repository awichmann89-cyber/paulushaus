'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { addDays, iso, kw, MON, parseISO, startOfWeek, longDate } from '@/lib/dates';
import { IcoLeft, IcoRight } from './Icons';

export function TopbarSlot({ today }: { today: string }) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  if (path !== '/') return <div className="tb-left" />;

  const view = params.get('v') ?? 'week';
  const cursor = parseISO(params.get('d') ?? today);
  const go = (d: Date, v: string) => router.push(`/?d=${iso(d)}&v=${v}`, { scroll: false });

  const shift = (n: number) => {
    if (view === 'month') go(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1), view);
    else go(addDays(cursor, view === 'week' ? 7 * n : n), view);
  };

  let title: React.ReactNode;
  if (view === 'week') {
    const a = startOfWeek(cursor), b = addDays(a, 6);
    title = <>{a.getDate()}.–{b.getDate()}. {MON[b.getMonth()]} {b.getFullYear()} <span>· KW {kw(a)}</span></>;
  } else if (view === 'month') {
    title = <>{MON[cursor.getMonth()]} {cursor.getFullYear()}</>;
  } else {
    title = longDate(cursor);
  }

  return (
    <div className="tb-left">
      <button className="today-btn" onClick={() => go(parseISO(today), view)}>Heute</button>
      <div className="nav-arrows">
        <button className="icon-btn" aria-label="Zurück" onClick={() => shift(-1)}><IcoLeft /></button>
        <button className="icon-btn" aria-label="Weiter" onClick={() => shift(1)}><IcoRight /></button>
      </div>
      <div className="tb-title">{title}</div>
      <div className="segmented" style={{ marginLeft: 18 }}>
        {([['day', 'Tag'], ['week', 'Woche'], ['month', 'Monat'], ['rooms', 'Räume']] as const).map(([v, l]) => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => go(cursor, v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}
