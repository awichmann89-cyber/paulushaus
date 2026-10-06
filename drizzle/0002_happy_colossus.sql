CREATE TABLE "booking_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"freq" text NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"weekdays" text,
	"monthly_mode" text,
	"anchor_date" date NOT NULL,
	"until_date" date,
	"count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "series_id" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_series_id_booking_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."booking_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_series_idx" ON "bookings" USING btree ("series_id");