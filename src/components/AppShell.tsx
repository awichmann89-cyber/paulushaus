'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { GroupView } from '@/lib/calendar';
import { doSignOut } from '@/lib/actions/auth';
import { iso, parseISO } from '@/lib/dates';
import { MiniCalendar } from './MiniCalendar';
import {
  IcoArrow, IcoCal, IcoCheck, IcoDoor, IcoDown, IcoEye, IcoInbox, IcoMenu, IcoOut, IcoPlus, IcoUsers,
} from './Icons';
import { Toaster } from './Toast';

const VisibilityCtx = createContext<Set<number> | null>(null);
export const useVisibleRooms = () => useContext(VisibilityCtx);

export function AppShell({ user, groups, pending, stale, today, topbar, children }: {
  user: { name: string; role: 'ADMIN' | 'USER' };
  groups: GroupView[];
  pending: number;
  stale: number;
  today: string;
  topbar?: ReactNode;
  children: ReactNode;
}) {
  const allIds = useMemo(() => groups.flatMap((g) => g.rooms.map((r) => r.id)), [groups]);
  const [visible, setVisible] = useState<Set<number>>(() => new Set(allIds));
  const [known, setKnown] = useState<Set<number>>(() => new Set(allIds));
  const [navOpen, setNavOpen] = useState(false);

  /* Neu angelegte Räume sind sofort sichtbar, ohne bereits abgewählte wieder einzublenden */
  useEffect(() => {
    const fresh = allIds.filter((id) => !known.has(id));
    if (!fresh.length) return;
    setVisible((v) => new Set([...v, ...fresh]));
    setKnown(new Set(allIds));
  }, [allIds, known]);
  const path = usePathname();
  const router = useRouter();
  const params = useSearchParams();

  /* Drawer bei jedem Seitenwechsel auf dem Handy wieder schließen */
  useEffect(() => { setNavOpen(false); }, [path]);
  const admin = user.role === 'ADMIN';
  const initials = user.name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();

  const cursor = parseISO(params.get('d') ?? today);
  const view = params.get('v') ?? 'week';

  const toggleRoom = (id: number) =>
    setVisible((v) => { const n = new Set(v); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (g: GroupView) =>
    setVisible((v) => {
      const n = new Set(v);
      const allOn = g.rooms.every((r) => n.has(r.id));
      g.rooms.forEach((r) => (allOn ? n.delete(r.id) : n.add(r.id)));
      return n;
    });

  const nav: [string, string, ReactNode, number][] = admin
    ? [['/', 'Kalender', <IcoCal key="c" />, 0],
       ['/requests', 'Anfragen', <IcoInbox key="i" />, pending],
       ['/export', 'Export & Druck', <IcoDown key="d" />, stale],
       ['/users', 'Nutzer', <IcoUsers key="u" />, 0],
       ['/rooms', 'Räume', <IcoDoor key="r" />, 0]]
    : [['/', 'Kalender', <IcoCal key="c" />, 0],
       ['/requests', 'Meine Anfragen', <IcoInbox key="i" />, pending]];

  return (
    <VisibilityCtx.Provider value={visible}>
      <div id="app" className="on">
        <div className="topbar">
          <button className="icon-btn menu-btn" aria-label="Menü" onClick={() => setNavOpen((v) => !v)}>
            <IcoMenu />
          </button>
          {topbar ?? <div className="tb-left" />}
          <div className="tb-right">
            <div className="role-pill">
              <span>{admin ? 'Admin' : 'Nutzer'}</span>
              <span className={`avatar${admin ? '' : ' u'}`}>{initials}</span>
            </div>
          </div>
        </div>

        <div className="body">
          <div className={`sidebar-scrim${navOpen ? ' on' : ''}`} onClick={() => setNavOpen(false)} />
          <aside className={`sidebar${navOpen ? ' open' : ''}`}>
            <div className="sb-scroll">
              <div className="brand">
                <div className="mark"><IcoCal s={15} /></div>
                <div><b>Paulushaus</b><small>Raumplaner</small></div>
              </div>

              <Link href={`/?d=${iso(cursor)}&v=${view}&new=1`} className="btn btn-primary new-btn"
                onClick={() => setNavOpen(false)}>
                <IcoPlus /> <span>{admin ? 'Termin anlegen' : 'Termin anfragen'}</span>
              </Link>

              <MiniCalendar cursor={cursor} today={parseISO(today)} view={view}
                onPick={(d) => { router.push(`/?d=${d}&v=${view}`); setNavOpen(false); }} />

              <div className="sb-label">Kalender / Räume</div>
              <div>
                {groups.map((g) => {
                  const allOn = g.rooms.every((r) => visible.has(r.id));
                  const someOn = g.rooms.some((r) => visible.has(r.id));
                  return (
                    <div className="grp" key={g.id}>
                      <div className="grp-head" onClick={() => toggleGroup(g)}>
                        <span className={`cbox${allOn ? ' on' : ''}${someOn && !allOn ? ' part' : ''}`}
                          style={{ ['--c' as string]: 'var(--text-3)' }}>{allOn && <IcoCheck />}</span>
                        <span>{g.name}</span><small>{g.rooms.length}</small>
                      </div>
                      {g.rooms.map((r) => {
                        const on = visible.has(r.id);
                        return (
                          <div key={r.id} className={`room-row${on ? '' : ' off'}`}
                            style={{ ['--c' as string]: r.color }} onClick={() => toggleRoom(r.id)}>
                            <span className={`cbox${on ? ' on' : ''}`}>{on && <IcoCheck />}</span>
                            <span>{r.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {!groups.length && (
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '4px 8px' }}>
                    Noch keine Räume angelegt.
                  </p>
                )}
              </div>

              <div className="sb-label">Verwaltung</div>
              <nav>
                {nav.map(([href, label, icon, badge]) => (
                  <Link key={href} href={href} className={`nav-item${path === href ? ' on' : ''}`}>
                    {icon}<span>{label}</span>
                    {badge > 0 && <span className="badge">{badge}</span>}
                  </Link>
                ))}
                <a className="nav-item" href="/oeffentlich" target="_blank" rel="noreferrer">
                  <IcoEye /><span>Öffentliche Ansicht</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-3)', display: 'flex' }}><IcoArrow /></span>
                </a>
              </nav>
            </div>

            <div className="sb-foot">
              <div className={`avatar${admin ? '' : ' u'}`}>{initials}</div>
              <div className="who">
                <b>{user.name}</b>
                <small>{admin ? 'Administrator' : 'Nutzer'}</small>
              </div>
              <form action={doSignOut} style={{ marginLeft: 'auto', display: 'flex' }}>
                <button className="icon-btn" title="Abmelden" type="submit"><IcoOut /></button>
              </form>
            </div>
          </aside>

          <main className="content">{children}</main>
        </div>
      </div>
      <Toaster />
    </VisibilityCtx.Provider>
  );
}
