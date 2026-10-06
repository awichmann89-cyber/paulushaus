'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { db, bookings, bookingSeries, rooms, users } from '@/lib/db';
import { requireAdmin, requireUser } from '@/lib/auth';
import { rangeText, type Ev, type SpanMode } from '@/lib/calendar';
import { conflictsFor, findConflicts, type Conflict, type Slot } from '@/lib/conflicts';
import { addDays, iso, parseISO } from '@/lib/dates';
import { describe, occurrences, validateRecurrence, type Recurrence } from '@/lib/recurrence';
import { seriesText } from '@/lib/data';
import { decisionMail, requestMail, sendMail } from '@/lib/mail';

export interface BookingInput {
  id?: number;
  roomId: number;
  title: string;
  note?: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  spanMode: SpanMode;
  attendees: number;
  /** nur beim Anlegen: aus dem Termin eine Serie machen */
  recurrence?: Recurrence | null;
  /** nur beim Bearbeiten eines Serientermins */
  scope?: 'one' | 'following';
}

const asEv = (i: Slot & { title?: string; attendees?: number }, id = -1): Ev => ({
  id, roomId: i.roomId, title: i.title ?? '', note: null,
  startDate: i.startDate, endDate: i.endDate, startTime: i.startTime, endTime: i.endTime,
  spanMode: i.spanMode, status: 'CONFIRMED', attendees: i.attendees ?? 0,
  createdBy: null, createdById: null, updatedAt: '',
});

const shift = (d: string, n: number) => iso(addDays(parseISO(d), n));
const daysBetween = (a: string, b: string) => Math.round((+parseISO(b) - +parseISO(a)) / 864e5);

function validate(i: BookingInput) {
  if (!i.roomId) throw new Error('Bitte einen Raum wählen.');
  if (!i.title.trim()) throw new Error('Bitte einen Titel angeben.');
  if (i.endDate < i.startDate) throw new Error('Das Bis-Datum liegt vor dem Von-Datum.');
  const sameDay = i.endDate === i.startDate;
  const throughMulti = !sameDay && i.spanMode === 'THROUGH';
  if ((sameDay || !throughMulti) && i.endTime <= i.startTime)
    throw new Error('Die Endzeit muss nach der Startzeit liegen.');
  if (i.recurrence) validateRecurrence(i.recurrence, i.startDate);
}

export async function saveBooking(input: BookingInput) {
  const me = await requireUser();
  validate(input);
  const admin = me.role === 'ADMIN';
  const spanMode: SpanMode = input.endDate === input.startDate ? 'SINGLE' : input.spanMode;
  const length = daysBetween(input.startDate, input.endDate);

  const values = {
    roomId: input.roomId,
    title: input.title.trim(),
    note: input.note?.trim() || null,
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: input.startTime,
    endTime: input.endTime,
    spanMode,
    attendees: input.attendees || 0,
    updatedAt: new Date(),
  };

  /* ---------- Bearbeiten ---------- */
  if (input.id) {
    await requireAdmin();
    const [orig] = await db.select().from(bookings).where(eq(bookings.id, input.id)).limit(1);
    if (!orig) throw new Error('Termin nicht gefunden.');

    if (input.scope !== 'following' || !orig.seriesId) {
      const conflicts = await findConflicts({ ...input, spanMode });
      await db.update(bookings).set(values).where(eq(bookings.id, input.id));
      revalidatePath('/', 'layout');
      return { ok: true as const, conflicts, pending: false, count: 1 };
    }

    // Dieser und alle folgenden: gleiche Felder, Datum um dieselbe Anzahl Tage verschoben
    const delta = daysBetween(orig.startDate, input.startDate);
    const rows = await db.select().from(bookings).where(and(
      eq(bookings.seriesId, orig.seriesId),
      gte(bookings.startDate, orig.startDate),
      inArray(bookings.status, ['PENDING', 'CONFIRMED']),
    ));
    const planned = rows.map((r) => {
      const startDate = shift(r.startDate, delta);
      return { id: r.id, startDate, endDate: shift(startDate, length) };
    });
    const conflicts = await conflictsFor(
      planned.map((p) => ({ ...values, ...p })), rows.map((r) => r.id));
    await db.transaction(async (tx) => {
      for (const p of planned)
        await tx.update(bookings).set({ ...values, startDate: p.startDate, endDate: p.endDate })
          .where(eq(bookings.id, p.id));
    });
    revalidatePath('/', 'layout');
    return { ok: true as const, conflicts, pending: false, count: planned.length };
  }

  /* ---------- Neu anlegen, einzeln oder als Serie ---------- */
  const r = input.recurrence ?? null;
  const starts = r ? occurrences(input.startDate, r).dates : [input.startDate];
  if (!starts.length) throw new Error('Die Wiederholung ergibt keinen einzigen Termin.');
  const slots = starts.map((s) => ({ ...values, startDate: s, endDate: shift(s, length) }));
  const conflicts = await conflictsFor(slots);
  const status = admin ? 'CONFIRMED' as const : 'PENDING' as const;

  await db.transaction(async (tx) => {
    let seriesId: number | null = null;
    if (r) {
      const [s] = await tx.insert(bookingSeries).values({
        freq: r.freq, interval: r.interval,
        weekdays: r.freq === 'WEEKLY' && r.weekdays?.length ? r.weekdays.join(',') : null,
        monthlyMode: r.freq === 'MONTHLY' ? r.monthly ?? 'DAY' : null,
        anchorDate: input.startDate, untilDate: r.until || null, count: r.count || null,
      }).returning({ id: bookingSeries.id });
      seriesId = s.id;
    }
    await tx.insert(bookings).values(slots.map((s) => ({
      ...s,
      status,
      seriesId,
      createdById: me.id,
      decidedById: admin ? me.id : null,
      decidedAt: admin ? new Date() : null,
    })));
  });

  if (!admin) {
    const when = rangeText(asEv(slots[0]))
      + (r ? ` · ${describe(r, input.startDate)} (${slots.length} Termine)` : '');
    await notifyAdmins(input, when, me.name, conflicts);
  }
  revalidatePath('/', 'layout');
  return { ok: true as const, conflicts: admin ? conflicts : [], pending: !admin, count: slots.length };
}

/** Neue Anfrage: alle aktiven Admins per E-Mail informieren – einzeln, damit
 *  die Adressen der Admins nicht gegenseitig sichtbar werden. */
async function notifyAdmins(input: BookingInput, when: string, requester: string, conflicts: Conflict[]) {
  try {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1);
    const admins = await db.select({ email: users.email }).from(users)
      .where(and(eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE')));
    if (!admins.length) return;

    const html = requestMail(
      requester, input.title.trim(), room?.name ?? '–', when,
      input.attendees || 0, input.note?.trim() || null, conflicts,
    );
    await Promise.all(admins.map((a) =>
      sendMail(a.email, `Neue Terminanfrage: ${input.title.trim()}`, html)));
  } catch (err) {
    // Eine fehlgeschlagene Benachrichtigung darf die Anfrage nicht scheitern lassen
    console.error('Admin-Benachrichtigung fehlgeschlagen:', err);
  }
}

/** Annehmen oder ablehnen. Bei einer Serienanfrage gilt die Entscheidung für
 *  alle noch offenen Termine der Serie – sonst müsste man 52-mal klicken. */
export async function decideBooking(id: number, accept: boolean, note?: string) {
  const me = await requireAdmin();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!b) throw new Error('Termin nicht gefunden.');

  const target = b.seriesId
    ? and(eq(bookings.seriesId, b.seriesId), eq(bookings.status, 'PENDING'))
    : eq(bookings.id, id);
  const changed = await db.update(bookings).set({
    status: accept ? 'CONFIRMED' : 'REJECTED',
    decidedById: me.id, decidedAt: new Date(), decisionNote: note ?? null,
    updatedAt: new Date(),
  }).where(target).returning({ id: bookings.id });

  if (b.createdById) {
    const [u] = await db.select().from(users).where(eq(users.id, b.createdById)).limit(1);
    const [r] = await db.select().from(rooms).where(eq(rooms.id, b.roomId)).limit(1);
    const [s] = b.seriesId
      ? await db.select().from(bookingSeries).where(eq(bookingSeries.id, b.seriesId)).limit(1) : [];
    if (u?.email) {
      const ev = { ...b, createdBy: null, createdById: null, updatedAt: '' } as unknown as Ev;
      const when = rangeText(ev) + (s ? ` · ${seriesText(s)} (${changed.length} Termine)` : '');
      await sendMail(u.email,
        accept ? `Termin bestätigt: ${b.title}` : `Termin abgelehnt: ${b.title}`,
        decisionMail(u.name, b.title, when, r?.name ?? '', accept, note));
    }
  }
  revalidatePath('/', 'layout');
  return { ok: true as const, count: changed.length };
}

/** Soft Delete – bleibt als Änderung für den Exportstatus sichtbar.
 *  `following` sagt bei einer Serie diesen und alle späteren Termine ab. */
export async function cancelBooking(id: number, scope: 'one' | 'following' = 'one') {
  await requireAdmin();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!b) throw new Error('Termin nicht gefunden.');

  const target = scope === 'following' && b.seriesId
    ? and(
        eq(bookings.seriesId, b.seriesId),
        gte(bookings.startDate, b.startDate),
        inArray(bookings.status, ['PENDING', 'CONFIRMED']),
      )
    : eq(bookings.id, id);
  const changed = await db.update(bookings)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(target).returning({ id: bookings.id });
  revalidatePath('/', 'layout');
  return { ok: true as const, count: changed.length };
}
