/** Läuft vor allem anderen: Serverzeit auf die Zeitzone des Hauses stellen.
 *  Vercel-Funktionen laufen sonst in UTC – dann wäre nachts der falsche Tag „heute“. */
export async function register() {
  process.env.TZ = process.env.APP_TIMEZONE || 'Europe/Berlin';
}
