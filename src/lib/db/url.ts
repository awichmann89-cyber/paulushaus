/**
 * Neon liefert Connection-Strings mit `channel_binding=require`. Dieser Parameter
 * gehört zu libpq; der Treiber postgres.js kennt ihn nicht und der Verbindungsaufbau
 * kann daran scheitern – teils mit einer leeren Fehlermeldung, was die Suche mühsam macht.
 * Deshalb wird genau dieser Parameter entfernt.
 *
 * Sonst wird am Connection-String NICHTS verändert. Insbesondere wird kein sslmode
 * ergänzt: bei einer lokalen Datenbank ohne TLS bricht die Verbindung damit ab.
 */
export function normalizeDatabaseUrl(raw: string): { url: string; changed: string[] } {
  const changed: string[] = [];
  try {
    const u = new URL(raw);
    if (u.searchParams.has('channel_binding')) {
      u.searchParams.delete('channel_binding');
      changed.push('channel_binding entfernt (von postgres.js nicht unterstützt)');
    }
    if (!changed.length) return { url: raw, changed };
    return { url: u.toString(), changed };
  } catch {
    return { url: raw, changed };   // kein parsbarer URL – unverändert durchlassen
  }
}

/** Zugangsdaten für Logausgaben unkenntlich machen */
export const maskUrl = (raw: string) => raw.replace(/\/\/[^@/]*@/, '//***@').split('?')[0];
