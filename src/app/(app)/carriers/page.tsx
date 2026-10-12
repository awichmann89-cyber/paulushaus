import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getCarrierList } from '@/lib/data';
import { CarriersClient } from '@/components/CarriersClient';

export const dynamic = 'force-dynamic';

export default async function CarriersPage() {
  const session = await auth();
  if (session?.user.role !== 'ADMIN') redirect('/');
  return <CarriersClient carriers={await getCarrierList()} />;
}
