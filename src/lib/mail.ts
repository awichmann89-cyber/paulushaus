import { Resend } from 'resend';

const key = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM ?? 'Raumplaner <onboarding@resend.dev>';
const resend = key ? new Resend(key) : null;

/** Gibt false zurück, wenn kein Key gesetzt ist – der Aufrufer zeigt dann den Link an. */
export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  if (!resend) return false;
  try {
    await resend.emails.send({ from, to, subject, html });
    return true;
  } catch (err) {
    console.error('Resend-Fehler:', err);
    return false;
  }
}

const shell = (body: string) => `
<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:28px 24px;color:#1d1d1f">
  <div style="font-size:17px;font-weight:600;letter-spacing:-.02em;margin-bottom:18px">Paulushaus · Raumplaner</div>
  ${body}
  <div style="margin-top:26px;padding-top:14px;border-top:1px solid #e5e5e7;font-size:12px;color:#8e8e93">
    Diese Nachricht wurde automatisch vom Raumplaner verschickt.
  </div>
</div>`;

export const inviteMail = (name: string, link: string) => shell(`
  <p style="font-size:15px;line-height:1.5">Hallo ${name},</p>
  <p style="font-size:15px;line-height:1.5">für dich wurde ein Zugang zum Raumplaner des Paulushauses angelegt.
     Über den folgenden Link legst du dein Passwort fest:</p>
  <p style="margin:22px 0">
    <a href="${link}" style="background:#007aff;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;
       font-size:14px;font-weight:500;display:inline-block">Passwort festlegen</a></p>
  <p style="font-size:12.5px;color:#6e6e73">Der Link ist 7 Tage gültig.<br>${link}</p>`);

export const decisionMail = (name: string, title: string, when: string, room: string, ok: boolean, note?: string) => shell(`
  <p style="font-size:15px;line-height:1.5">Hallo ${name},</p>
  <p style="font-size:15px;line-height:1.5">deine Anfrage <b>${title}</b> wurde
     ${ok ? '<span style="color:#1d8a3c">bestätigt</span>' : '<span style="color:#c9241a">abgelehnt</span>'}.</p>
  <table style="font-size:14px;line-height:1.7;margin:14px 0">
    <tr><td style="color:#6e6e73;padding-right:14px">Raum</td><td>${room}</td></tr>
    <tr><td style="color:#6e6e73;padding-right:14px">Zeitraum</td><td>${when}</td></tr>
  </table>
  ${note ? `<p style="font-size:14px;background:#f5f5f7;padding:11px 13px;border-radius:9px">${note}</p>` : ''}`);
