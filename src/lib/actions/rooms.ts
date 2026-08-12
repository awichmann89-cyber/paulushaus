'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db, rooms, roomGroups } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export interface RoomInput {
  id?: number;
  name: string;
  color: string;
  capacity: number;
  equipment: string;
  groupId: number | null;
  newGroupName?: string;
  isPublic: boolean;
}

export async function saveRoom(input: RoomInput) {
  await requireAdmin();
  if (!input.name.trim()) throw new Error('Bitte einen Raumnamen angeben.');

  let groupId = input.groupId;
  if (input.newGroupName?.trim()) {
    const [max] = await db.select({ m: sql<number>`coalesce(max(sort_order),0)::int` }).from(roomGroups);
    const [g] = await db.insert(roomGroups)
      .values({ name: input.newGroupName.trim(), sortOrder: (max?.m ?? 0) + 10 })
      .returning();
    groupId = g.id;
  }

  const values = {
    name: input.name.trim(), color: input.color, capacity: input.capacity || 0,
    equipment: input.equipment.trim(), groupId, isPublic: input.isPublic,
  };

  if (input.id) await db.update(rooms).set(values).where(eq(rooms.id, input.id));
  else {
    const [max] = await db.select({ m: sql<number>`coalesce(max(sort_order),0)::int` }).from(rooms);
    await db.insert(rooms).values({ ...values, sortOrder: (max?.m ?? 0) + 10 });
  }
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

export async function archiveRoom(id: number) {
  await requireAdmin();
  await db.update(rooms).set({ isActive: false }).where(eq(rooms.id, id));
  revalidatePath('/', 'layout');
  return { ok: true as const };
}

export async function saveGroup(id: number | null, name: string) {
  await requireAdmin();
  if (!name.trim()) throw new Error('Bitte einen Gruppennamen angeben.');
  if (id) await db.update(roomGroups).set({ name: name.trim() }).where(eq(roomGroups.id, id));
  else {
    const [max] = await db.select({ m: sql<number>`coalesce(max(sort_order),0)::int` }).from(roomGroups);
    await db.insert(roomGroups).values({ name: name.trim(), sortOrder: (max?.m ?? 0) + 10 });
  }
  revalidatePath('/', 'layout');
  return { ok: true as const };
}
