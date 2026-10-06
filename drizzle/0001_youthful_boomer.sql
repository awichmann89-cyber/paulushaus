ALTER TABLE "bookings" ADD COLUMN "import_source" text;--> statement-breakpoint
CREATE INDEX "bookings_import_idx" ON "bookings" USING btree ("import_source");