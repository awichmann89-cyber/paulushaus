'use server';

import { AuthError } from 'next-auth';
import { signIn, signOut } from '@/lib/auth';

export async function doSignIn(_prev: string | undefined, formData: FormData) {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/',
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return err.type === 'CredentialsSignin'
        ? 'E-Mail oder Passwort stimmt nicht – oder der Zugang ist noch nicht aktiviert.'
        : 'Anmeldung fehlgeschlagen. Bitte später erneut versuchen.';
    }
    throw err;
  }
}

export async function doSignOut() {
  await signOut({ redirectTo: '/login' });
}
