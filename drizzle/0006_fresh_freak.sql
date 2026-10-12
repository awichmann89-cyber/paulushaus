CREATE TABLE "carriers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "carrier_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Bisher stand der Träger als „… · Träger: Name“ in der Notiz (Excel-Import). Daraus
-- werden Träger-Stammdaten, die Notiz verliert den Teil. updated_at bleibt unberührt,
-- damit importierte Termine nicht als „nachträglich geändert“ zählen.
INSERT INTO "carriers" ("name")
SELECT DISTINCT ON (lower(t.name)) t.name FROM (
  SELECT substring("note" from '(?:^| · )Träger: ([^·]*[^·[:space:]])') AS name FROM "bookings"
) t
WHERE t.name IS NOT NULL
ORDER BY lower(t.name), t.name;--> statement-breakpoint
UPDATE "bookings" b SET
  "carrier_id" = c.id,
  "note" = nullif(btrim(regexp_replace(regexp_replace(b.note, '(^| · )Träger: [^·]*[^·[:space:]]', ''), '^ · ', '')), '')
FROM "carriers" c
WHERE lower(substring(b.note from '(?:^| · )Träger: ([^·]*[^·[:space:]])')) = lower(c.name);
