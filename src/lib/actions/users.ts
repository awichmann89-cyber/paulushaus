'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, users } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { inviteMail, sendMail } from '@/lib/mail';

const baseUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export async function inviteUser(input: { name: string; email: string; role: 'ADMIN' | 'USER' }) {
  await requireAdmin();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) throw new Error('Bitte einen Namen angeben.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Bitte eine gültige E-Mail-Adresse angeben.');

  const [exists] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (exists) throw new Error('Diese E-Mail-Adresse ist bereits vergeben.');

  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await db.insert(users).values({
    email, name, role: input.role, status: 'INVITED',
    inviteToken: token, inviteExpiresAt: expires,
  });

  const link = `${baseUrl()}/invite/${token}`;
  const sent = await sendMail(email, 'Dein Zugang zum Raumplaner', inviteMail(name, link));
  revalidatePath('/', 'layout');
  return { ok: true as const, sent, link };
}

export async function resendInvite(id: number) {
  await requireAdmin();
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const [u] = await db.update(users)
    .set({ inviteToken: token, inviteExpiresAt: expires, status: 'INVITED' })
    .where(eq(users.id, id)).returning();
  const link = `${baseUrl()}/invite/${token}`;
  const sent = await sendMail(u.email, 'Dein Zugang zum Raumplaner', inviteMail(u.name, link));
  revalidatePath('/', 'layout');
  return { ok: true as const, sent, link };
}

export async function setUserRole(id: number, role: 'ADMIN' | 'USER') {
  const me = await requireAdmin();
  if (me.id === id && role !== 'ADMIN') throw new Error('Du kannst dir die Adminrechte nicht selbst entziehen.');
  await db.update(users).set({ role }).where(eq(users.id, id));
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

export async function setUserStatus(id: number, status: 'ACTIVE' | 'DISABLED') {
  const me = await requireAdmin();
  if (me.id === id) throw new Error('Du kannst deinen eigenen Zugang nicht sperren.');
  await db.update(users).set({ status }).where(eq(users.id, id));
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
