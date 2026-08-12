import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from '../src/lib/db/schema';

const { users } = schema;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL fehlt (.env anlegen oder Variable setzen).');

  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrator';
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!email || !password) throw new Error('SEED_ADMIN_EMAIL und SEED_ADMIN_PASSWORD müssen gesetzt sein.');
  if (password.length < 10) throw new Error('Bitte ein Passwort mit mindestens 10 Zeichen setzen.');

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });
  const hash = await bcrypt.hash(password, 10);

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await db.update(users)
      .set({ passwordHash: hash, role: 'ADMIN', status: 'ACTIVE', name, inviteToken: null })
      .where(eq(users.id, existing.id));
    console.log(`Admin aktualisiert: ${email}`);
  } else {
    await db.insert(users).values({ email, name, passwordHash: hash, role: 'ADMIN', status: 'ACTIVE' });
    console.log(`Admin angelegt: ${email}`);
  }
  console.log('Fertig. Räume und Gruppen legst du in der Oberfläche unter „Räume“ an.');
  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
