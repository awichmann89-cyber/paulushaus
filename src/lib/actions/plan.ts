'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { analyzePlan, applyPlan, type ImportPreview, type SheetMapping } from '@/lib/plan/import';

async function read(fd: FormData) {
  const file = fd.get('file');
  if (!(file instanceof File) || !file.size) throw new Error('Bitte eine Excel-Datei auswählen.');
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Nur .xlsx-Dateien werden unterstützt.');
  const raw = fd.get('mapping');
  const mapping = typeof raw === 'string' && raw ? (JSON.parse(raw) as SheetMapping) : undefined;
  return analyzePlan(await file.arrayBuffer(), file.name, mapping);
}

/** Liest die Datei und zeigt, was der Import tun würde – schreibt nichts */
export async function previewPlanImport(fd: FormData): Promise<ImportPreview> {
  await requireAdmin();
  const { values: _values, ...preview } = await read(fd);
  return preview;
}

/** Ersetzt den vorigen Import desselben Jahres durch den Inhalt der Datei */
export async function commitPlanImport(fd: FormData) {
  const me = await requireAdmin();
  const analysis = await read(fd);
  if (!analysis.total) throw new Error('Keinem Blatt ist ein Raum zugeordnet – es gäbe nichts zu importieren.');
  const res = await applyPlan(analysis, me.id);
  revalidatePath('/', 'layout');
  return { ok: true as const, year: analysis.year, ...res };
}
