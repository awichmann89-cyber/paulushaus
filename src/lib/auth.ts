import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db, users } from './db';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? '').trim().toLowerCase();
        const password = String(creds?.password ?? '');
        if (!email || !password) return null;

        const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (!u || !u.passwordHash || u.status !== 'ACTIVE') return null;
        if (!(await bcrypt.compare(password, u.passwordHash))) return null;

        await db.update(users).set({ lastLoginAt: sql`now()` }).where(eq(users.id, u.id));
        return { id: String(u.id), name: u.name, email: u.email, role: u.role };
      },
    }),
  ],
});

/** Wirft, wenn niemand angemeldet ist – für Server Actions */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Nicht angemeldet.');
  return { id: Number(session.user.id), name: session.user.name ?? '', role: session.user.role };
}
export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== 'ADMIN') throw new Error('Nur Administratoren dürfen das.');
  return u;
}
