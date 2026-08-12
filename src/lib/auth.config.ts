import type { NextAuthConfig } from 'next-auth';

/** Edge-taugliche Basiskonfiguration – ohne Datenbank und ohne bcrypt */
export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id?: string }).id;
        token.role = (user as { role?: string }).role;
        token.name = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.uid ?? '');
        session.user.role = (token.role as 'ADMIN' | 'USER') ?? 'USER';
      }
      return session;
    },
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const open = path.startsWith('/login') || path.startsWith('/oeffentlich') ||
        path.startsWith('/invite') || path.startsWith('/api/auth');
      if (open) return true;
      return !!auth?.user;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
