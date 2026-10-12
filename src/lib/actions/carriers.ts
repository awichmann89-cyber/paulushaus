'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db, carriers } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

/** Anlegen oder umbenennen. Ein Umbenennen gilt für alle Termine des Trägers */
export async function saveCarrier(id: number | null, name: string) {
  await requireAdmin();
  const value = name.trim().replace(/\s+/g, ' ');
  if (!value) throw new Error('Bitte einen Namen angeben.');

  const [dupe] = await db.select({ id: carriers.id }).from(carriers).where(and(
    sql`lower(${carriers.name}) = lower(${value})`,
    id ? ne(carriers.id, id) : undefined,
  )).limit(1);
  if (dupe) throw new Error(`Den Träger „${value}“ gibt es schon.`);

  if (id) await db.update(carriers).set({ name: value }).where(eq(carriers.id, id));
  else await db.insert(carriers).values({ name: value });
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

/** Archivierte Träger bleiben an ihren Terminen, sind aber nicht mehr wählbar */
export async function setCarrierActive(id: number, active: boolean) {
  await requireAdmin();
  await db.update(carriers).set({ isActive: active }).where(eq(carriers.id, id));
  revalidatePath('/', 'layout');
  return { ok: true as const };
}
