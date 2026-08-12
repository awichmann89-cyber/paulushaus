'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { db, roomExports } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

/** Merkt sich pro Raum und Monat den Exportzeitpunkt – Basis der Änderungsanzeige */
export async function recordExport(roomIds: number[], month: string) {
  const me = await requireAdmin();
  if (!roomIds.length) throw new Error('Keine Räume ausgewählt.');
  const now = new Date();

  const existing = await db.select().from(roomExports)
    .where(and(eq(roomExports.month, month), inArray(roomExports.roomId, roomIds)));
  const known = new Set(existing.map((e) => e.roomId));

  const fresh = roomIds.filter((id) => !known.has(id));
  if (fresh.length) {
    await db.insert(roomExports).values(
      fresh.map((roomId) => ({ roomId, month, exportedAt: now, exportedById: me.id })),
    );
  }
  if (known.size) {
    await db.update(roomExports).set({ exportedAt: now, exportedById: me.id })
      .where(and(eq(roomExports.month, month), inArray(roomExports.roomId, [...known])));
  }
  revalidatePath('/', 'layout');
  return { ok: true as const, at: now.toISOString() };
}
