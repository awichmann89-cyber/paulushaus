CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"start_time" time(0) NOT NULL,
	"end_time" time(0) NOT NULL,
	"span_mode" text DEFAULT 'SINGLE' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attendees" integer DEFAULT 0 NOT NULL,
	"created_by_id" integer,
	"decided_by_id" integer,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"room_id" integer NOT NULL,
	"month" text NOT NULL,
	"exported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exported_by_id" integer
);
--> statement-breakpoint
CREATE TABLE "room_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#007AFF' NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"equipment" text DEFAULT '' NOT NULL,
	"group_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'USER' NOT NULL,
	"status" text DEFAULT 'INVITED' NOT NULL,
	"invite_token" text,
	"invite_expires_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_exports" ADD CONSTRAINT "room_exports_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_exports" ADD CONSTRAINT "room_exports_exported_by_id_users_id_fk" FOREIGN KEY ("exported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_group_id_room_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."room_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_range_idx" ON "bookings" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "bookings_room_idx" ON "bookings" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_exports_room_month_idx" ON "room_exports" USING btree ("room_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_token_idx" ON "users" USING btree ("invite_token");