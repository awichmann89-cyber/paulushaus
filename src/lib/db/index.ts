import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

type DB = ReturnType<typeof drizzle<typeof schema>>;
let instance: DB | null = null;

/** Verbindung wird erst beim ersten Zugriff aufgebaut – so läuft `next build` auch ohne DATABASE_URL */
function connect(): DB {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL fehlt. Lokal in .env eintragen, in Vercel unter Settings → Environment Variables setzen.',
      );
    }
    // prepare:false und max:1 sind die richtigen Werte hinter einem Connection-Pooler (Neon, Supabase, Vercel Postgres)
    const client = postgres(url, { prepare: false, max: 1, idle_timeout: 20 });
    instance = drizzle(client, { schema });
  }
  return instance;
}

export const db = new Proxy({} as DB, {
  get: (_t, prop) => Reflect.get(connect() as object, prop),
}) as DB;

export * from './schema';
