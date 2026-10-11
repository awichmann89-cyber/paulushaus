ALTER TABLE "bookings" ADD COLUMN "contact_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "short" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contact_id_users_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;