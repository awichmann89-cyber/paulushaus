-- Bisher stand die Ansprechperson aus dem Excel-Import als „… · Ansprechperson: X“ in der
-- Notiz. Gleiche Regeln wie der Import (src/lib/plan/parse.ts → matchPerson): X trifft eine
-- Person über Kürzel, vollen Namen oder Initialen. Unbekannte werden Kontakte ohne Zugang,
-- mehrdeutige bleiben in der Notiz. Nur Termine ohne eigene Ansprechperson, updated_at bleibt.
WITH found AS (
  SELECT DISTINCT ON (lower(t.v)) t.v FROM (
    SELECT substring("note" from '(?:^| · )Ansprechperson: ([^·]*[^·[:space:]])') AS v
    FROM "bookings" WHERE "contact_id" IS NULL
  ) t
  WHERE t.v IS NOT NULL
  ORDER BY lower(t.v), t.v
), people AS (
  SELECT lower(btrim(u."name")) AS lname,
    lower(coalesce(nullif(btrim(u."short"), ''), (
      SELECT string_agg(left(w, 1), '' ORDER BY i)
      FROM regexp_split_to_table(btrim(u."name"), '\s+') WITH ORDINALITY AS s(w, i) WHERE w <> ''
    ))) AS lshort
  FROM "users" u
)
INSERT INTO "users" ("name", "short", "status", "role")
SELECT f.v, CASE WHEN f.v !~ '\s' AND length(f.v) <= 4 THEN f.v END, 'CONTACT', 'USER'
FROM found f
WHERE NOT EXISTS (SELECT 1 FROM people p WHERE p.lname = lower(f.v) OR p.lshort = lower(f.v));--> statement-breakpoint
WITH people AS (
  SELECT u."id", lower(btrim(u."name")) AS lname,
    lower(coalesce(nullif(btrim(u."short"), ''), (
      SELECT string_agg(left(w, 1), '' ORDER BY i)
      FROM regexp_split_to_table(btrim(u."name"), '\s+') WITH ORDINALITY AS s(w, i) WHERE w <> ''
    ))) AS lshort
  FROM "users" u
), b AS (
  SELECT "id", lower(substring("note" from '(?:^| · )Ansprechperson: ([^·]*[^·[:space:]])')) AS v
  FROM "bookings" WHERE "contact_id" IS NULL
), hit AS (
  SELECT b."id" AS booking_id, min(p."id") AS user_id
  FROM b JOIN people p ON p.lname = b.v OR p.lshort = b.v
  GROUP BY b."id"
  HAVING count(*) = 1
)
UPDATE "bookings" SET
  "contact_id" = hit.user_id,
  "note" = nullif(btrim(regexp_replace(regexp_replace("bookings"."note", '(^| · )Ansprechperson: [^·]*[^·[:space:]]', ''), '^ · ', '')), '')
FROM hit
WHERE "bookings"."id" = hit.booking_id;
