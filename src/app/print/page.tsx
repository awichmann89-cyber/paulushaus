import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { berlinStamp } from '@/lib/dates';
import { getPrintSheets, printParams } from '@/lib/print';
import { PrintSheets } from '@/components/PrintSheets';

export const dynamic = 'force-dynamic';

export default async function PrintPage({
  searchParams,
}: { searchParams: Promise<{ month?: string; rooms?: string; auto?: string }> }) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');

  const { month, roomIds } = printParams(sp.month, sp.rooms);
  const sheets = await getPrintSheets(month, roomIds);

  return (
    <div className="print-page">
      <PrintSheets sheets={sheets} stand={berlinStamp(new Date())} autoPrint={sp.auto === '1'} />
    </div>
  );
}
