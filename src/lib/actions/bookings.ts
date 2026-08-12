'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { db, bookings, rooms, users } from '@/lib/db';
import { requireAdmin, requireUser } from '@/lib/auth';
import { overlaps, type Ev, type SpanMode } from '@/lib/calendar';
import { rangeText } from '@/lib/calendar';
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
}

const asEv = (i: BookingInput, id = -1): Ev => ({
  id, roomId: i.roomId, title: i.title, note: i.note ?? null,
  startDate: i.startDate, endDate: i.endDate, startTime: i.startTime, endTime: i.endTime,
  spanMode: i.spanMode, status: 'CONFIRMED', attendees: i.attendees,
  createdBy: null, createdById: null, updatedAt: '',
});

/** Kollisionen mit bestätigten Terminen desselben Raums – tageweise geprüft */
export async function findConflicts(input: BookingInput): Promise<{ title: string; when: string }[]> {
  const rows = await db.select().from(bookings).where(and(
    eq(bookings.roomId, input.roomId),
    eq(bookings.status, 'CONFIRMED'),
    lte(bookings.startDate, input.endDate),
    gte(bookings.endDate, input.startDate),
    input.id ? ne(bookings.id, input.id) : sql`true`,
  ));
  const candidate = asEv(input);
  return rows
    .map((b) => ({
      id: b.id, roomId: b.roomId, title: b.title, note: b.note,
      startDate: b.startDate, endDate: b.endDate, startTime: b.startTime, endTime: b.endTime,
      spanMode: b.spanMode, status: b.status, attendees: b.attendees,
      createdBy: null, createdById: null, updatedAt: '',
    } as Ev))
    .filter((e) => overlaps(e, candidate))
    .map((e) => ({ title: e.title, when: rangeText(e) }));
}

function validate(i: BookingInput) {
  if (!i.roomId) throw new Error('Bitte einen Raum wählen.');
  if (!i.title.trim()) throw new Error('Bitte einen Titel angeben.');
  if (i.endDate < i.startDate) throw new Error('Das Bis-Datum liegt vor dem Von-Datum.');
  const sameDay = i.endDate === i.startDate;
  const throughMulti = !sameDay && i.spanMode === 'THROUGH';
  if ((sameDay || !throughMulti) && i.endTime <= i.startTime)
    throw new Error('Die Endzeit muss nach der Startzeit liegen.');
}

export async function saveBooking(input: BookingInput) {
  const me = await requireUser();
  validate(input);
  const admin = me.role === 'ADMIN';
  const spanMode: SpanMode = input.endDate === input.startDate ? 'SINGLE' : input.spanMode;

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

  const conflicts = await findConflicts({ ...input, spanMode });

  if (input.id) {
    await requireAdmin();
    await db.update(bookings).set(values).where(eq(bookings.id, input.id));
  } else {
    await db.insert(bookings).values({
      ...values,
      status: admin ? 'CONFIRMED' : 'PENDING',
      createdById: me.id,
      decidedById: admin ? me.id : null,
      decidedAt: admin ? new Date() : null,
    });
    if (!admin) await notifyAdmins({ ...input, spanMode }, me.name, conflicts);
  }
  revalidatePath('/', 'layout');
  return { ok: true as const, conflicts: admin ? conflicts : [], pending: !admin };
}

/** Neue Anfrage: alle aktiven Admins per E-Mail informieren – einzeln, damit
 *  die Adressen der Admins nicht gegenseitig sichtbar werden. */
async function notifyAdmins(
  input: BookingInput, requester: string, conflicts: { title: string; when: string }[],
) {
  try {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1);
    const admins = await db.select({ email: users.email }).from(users)
      .where(and(eq(users.role, 'ADMIN'), eq(users.status, 'ACTIVE')));
    if (!admins.length) return;

    const when = rangeText(asEv(input));
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

export async function decideBooking(id: number, accept: boolean, note?: string) {
  const me = await requireAdmin();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!b) throw new Error('Termin nicht gefunden.');

  await db.update(bookings).set({
    status: accept ? 'CONFIRMED' : 'REJECTED',
    decidedById: me.id, decidedAt: new Date(), decisionNote: note ?? null,
    updatedAt: new Date(),
  }).where(eq(bookings.id, id));

  if (b.createdById) {
    const [u] = await db.select().from(users).where(eq(users.id, b.createdById)).limit(1);
    const [r] = await db.select().from(rooms).where(eq(rooms.id, b.roomId)).limit(1);
    if (u?.email) {
      const ev = { ...b, createdBy: null, createdById: null, updatedAt: '' } as unknown as Ev;
      await sendMail(u.email,
        accept ? `Termin bestätigt: ${b.title}` : `Termin abgelehnt: ${b.title}`,
        decisionMail(u.name, b.title, rangeText(ev), r?.name ?? '', accept, note));
    }
  }
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

/** Soft Delete – bleibt als Änderung für den Exportstatus sichtbar */
export async function cancelBooking(id: number) {
  await requireAdmin();
  await db.update(bookings)
    .set({ status: 'CANCELLED', updatedAt: new Date() })
    .where(eq(bookings.id, id));
  revalidatePath('/', 'layout');
  return { ok: true as const };
}
