/**
 * Läuft vor `next build` (auch im Vercel-Build):
 *   1. Migrationen aus drizzle/ einspielen
 *   2. beim allerersten Deploy einen Admin-Account anlegen, falls noch keiner existiert
 *
 * Der Schritt ist absichtlich fehlertolerant: fehlt DATABASE_URL, wird nur gewarnt
 * und der Build läuft weiter – so kann man die App auch ohne Datenbank bauen.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as schema from '../src/lib/db/schema';

const { users } = schema;

/** Zwei gleichzeitige Builds dürfen nicht dieselbe Migration nebeneinander fahren */
const LOCK_KEY = 4711_0815;

function log(msg: string) {
  console.log(`[db] ${msg}`);
}

async function main() {
  if (process.env.SKIP_DB_MIGRATE === '1') {
    log('SKIP_DB_MIGRATE=1 gesetzt – Migration übersprungen.');
    return;
  }

  // Für DDL ist die direkte Verbindung besser als der Pooler.
  // DIRECT_DATABASE_URL ist optional; ohne sie wird DATABASE_URL benutzt.
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    log('DATABASE_URL fehlt – Migration übersprungen. Die App startet erst, wenn die Variable gesetzt ist.');
    return;
  }

  const client = postgres(url, {
    max: 1, prepare: false, idle_timeout: 10, connect_timeout: 30,
    onnotice: () => {}, // "schema already exists, skipping" ist beim zweiten Lauf normal
  });
  const db = drizzle(client, { schema });

  try {
    await client`select pg_advisory_lock(${LOCK_KEY})`;
    log('Migrationen werden geprüft …');
    await migrate(db, { migrationsFolder: './drizzle' });
    log('Schema ist aktuell.');
    await bootstrapAdmin(db);
  } finally {
    try { await client`select pg_advisory_unlock(${LOCK_KEY})`; } catch { /* Verbindung ggf. schon zu */ }
    await client.end({ timeout: 5 });
  }
}

/**
 * Legt genau dann einen Admin an, wenn es noch gar keinen gibt.
 * Bewusst nicht "Passwort bei jedem Deploy überschreiben" – sonst würde jeder
 * Build das Passwort auf den Wert der Umgebungsvariable zurücksetzen.
 */
async function bootstrapAdmin(db: ReturnType<typeof drizzle<typeof schema>>) {
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrator';

  if (!email || !password) {
    log('SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD nicht gesetzt – kein Admin-Bootstrap.');
    return;
  }
  if (password.length < 10) {
    log('SEED_ADMIN_PASSWORD ist kürzer als 10 Zeichen – Admin wurde NICHT angelegt.');
    return;
  }

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.role, 'ADMIN'));

  if (n > 0) {
    log(`Es existiert bereits ein Admin – Bootstrap übersprungen.`);
    return;
  }

  await db.insert(users).values({
    email, name,
    passwordHash: await bcrypt.hash(password, 10),
    role: 'ADMIN', status: 'ACTIVE',
  });
  log(`Erster Admin angelegt: ${email}`);
}

main().catch((err) => {
  console.error('[db] Migration fehlgeschlagen:', err instanceof Error ? err.message : err);
  process.exit(1);
});
