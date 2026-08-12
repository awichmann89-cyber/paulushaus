import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL fehlt.');
  const client = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrationen eingespielt.');
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
