'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, users } from '@/lib/db';
import type { UserStatus } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/auth';
import { appUrl, inviteMail, sendMail } from '@/lib/mail';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Prüft und normalisiert die Kontaktdaten. E-Mail ist nur für Accounts Pflicht */
async function cleanContact(input: { name: string; email: string; phone: string }, needEmail: boolean, selfId?: number) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Bitte einen Namen angeben.');
  if (needEmail && !email) throw new Error('Für einen Zugang wird eine E-Mail-Adresse gebraucht.');
  if (email && !EMAIL_RE.test(email)) throw new Error('Bitte eine gültige E-Mail-Adresse angeben.');
  if (phone && !/^[0-9+()/\- ]{3,40}$/.test(phone)) throw new Error('Bitte eine gültige Telefonnummer angeben.');
  if (email) {
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (exists && exists.id !== selfId) throw new Error('Diese E-Mail-Adresse ist bereits vergeben.');
  }
  return { name, email: email || null, phone: phone || null };
}

async function sendInvite(id: number) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const [u] = await db.update(users)
    .set({ inviteToken: token, inviteExpiresAt: expires, status: 'INVITED' })
    .where(eq(users.id, id)).returning();
  const link = `${appUrl()}/invite/${token}`;
  const sent = await sendMail(u.email!, 'Dein Zugang zum Raumplaner', inviteMail(u.name, link));
  return { sent, link };
}

/** Legt eine Person an – mit Einladung zum Account oder nur als Kontakt ohne Zugang */
export async function createUser(input: {
  name: string; email: string; phone: string; role: 'ADMIN' | 'USER'; account: boolean;
}) {
  await requireAdmin();
  const data = await cleanContact(input, input.account);
  const [u] = await db.insert(users).values({
    ...data, role: input.account ? input.role : 'USER', status: 'CONTACT',
  }).returning({ id: users.id });

  const invite = input.account ? await sendInvite(u.id) : null;
  revalidatePath('/', 'layout');
  return { ok: true as const, invite };
}

/** Name, E-Mail und Telefon ändern */
export async function updateUser(id: number, input: { name: string; email: string; phone: string }) {
  await requireAdmin();
  const [u] = await db.select({ status: users.status, passwordHash: users.passwordHash })
    .from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw new Error('Person nicht gefunden.');
  // Wer sich anmelden kann oder eingeladen ist, braucht die E-Mail als Login
  const data = await cleanContact(input, u.status !== 'CONTACT' && (u.status !== 'DISABLED' || !!u.passwordHash), id);
  await db.update(users).set(data).where(eq(users.id, id));
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

/** Einladung (erneut) verschicken – macht aus einem Kontakt einen Account */
export async function resendInvite(id: number) {
  await requireAdmin();
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, id)).limit(1);
  if (!u?.email) throw new Error('Bitte zuerst eine E-Mail-Adresse hinterlegen.');
  const invite = await sendInvite(id);
  revalidatePath('/', 'layout');
  return { ok: true as const, ...invite };
}

export async function setUserRole(id: number, role: 'ADMIN' | 'USER') {
  const me = await requireAdmin();
  if (me.id === id && role !== 'ADMIN') throw new Error('Du kannst dir die Adminrechte nicht selbst entziehen.');
  await db.update(users).set({ role }).where(eq(users.id, id));
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

/** Kürzel für die Monatslisten; leer heißt: Initialen aus dem Namen */
export async function setUserShort(id: number, short: string) {
  await requireAdmin();
  const value = short.trim().slice(0, 8);
  await db.update(users).set({ short: value || null }).where(eq(users.id, id));
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

export async function setUserStatus(id: number, status: 'ACTIVE' | 'DISABLED') {
  const me = await requireAdmin();
  if (me.id === id) throw new Error('Du kannst deinen eigenen Zugang nicht sperren.');
  let next: UserStatus = status;
  if (status === 'ACTIVE') {
    // Ohne Passwort gibt es keinen Zugang – dann wird die Person wieder zum Kontakt
    const [u] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, id)).limit(1);
    if (!u?.passwordHash) next = 'CONTACT';
  }
  await db.update(users).set({ status: next }).where(eq(users.id, id));
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

/** Passwort über Einladungslink setzen – ohne Anmeldung erreichbar */
export async function acceptInvite(token: string, password: string) {
  if (password.length < 10) throw new Error('Das Passwort muss mindestens 10 Zeichen haben.');
  const [u] = await db.select().from(users).where(eq(users.inviteToken, token)).limit(1);
  if (!u) throw new Error('Dieser Einladungslink ist ungültig.');
  if (u.inviteExpiresAt && u.inviteExpiresAt < new Date()) throw new Error('Dieser Einladungslink ist abgelaufen.');

  await db.update(users).set({
    passwordHash: await bcrypt.hash(password, 10),
    status: 'ACTIVE', inviteToken: null, inviteExpiresAt: null,
  }).where(eq(users.id, u.id));
  return { ok: true as const, email: u.email };
}
