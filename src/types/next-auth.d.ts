import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: 'ADMIN' | 'USER';
    };
  }
  interface User {
    role?: 'ADMIN' | 'USER';
  }
}
