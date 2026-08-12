import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getExportStatus } from '@/lib/data';
import { ExportClient } from '@/components/ExportClient';
import { ymOf } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function ExportPage({
  searchParams,
}: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  const month = /^\d{4}-\d{2}$/.test(sp.m ?? '') ? sp.m! : ymOf(new Date());
  const rows = await getExportStatus(month);

  return (
    <ExportClient
      month={month}
      rows={rows.map((r) => ({
        roomId: r.room.id, name: r.room.name, color: r.room.color, groupName: r.room.groupName,
        count: r.count,
        exportedAt: r.exportedAt ? r.exportedAt.toISOString() : null,
        changes: r.changes,
      }))}
    />
  );
}
