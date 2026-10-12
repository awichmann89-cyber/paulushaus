import { auth } from '@/lib/auth';
import { berlinStamp } from '@/lib/dates';
import { buildMonthPdf } from '@/lib/pdf';
import { getPrintSheets, monthName, printParams } from '@/lib/print';

export const dynamic = 'force-dynamic';

/** Monatslisten als PDF-Download: /print/pdf?month=2026-05&rooms=1,2 */
export async function GET(req: Request) {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') return new Response('Nur für Administratoren.', { status: 403 });

  const sp = new URL(req.url).searchParams;
  const { month, roomIds } = printParams(sp.get('month'), sp.get('rooms'));
  const sheets = await getPrintSheets(month, roomIds);
  if (!sheets.length) return new Response('Keine Räume ausgewählt.', { status: 400 });

  const title = `Belegungsplan ${monthName(month)}`;
  const pdf = await buildMonthPdf(sheets, berlinStamp(new Date()), title);
  const name = `${title} – ${sheets.length === 1 ? sheets[0].name : `${sheets.length} Räume`}.pdf`.replace(/[\\/:*?"<>|]/g, '-');
  const ascii = name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '');

  return new Response(pdf as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
