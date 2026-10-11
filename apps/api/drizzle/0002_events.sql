CREATE TYPE "public"."event_category" AS ENUM('party', 'music', 'sport', 'arts', 'culture', 'academic', 'career', 'wellness', 'other');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" "event_category" NOT NULL,
	"venue" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"volunteers_wanted" boolean DEFAULT false NOT NULL,
	"cover_key" text,
	"created_by_id" uuid,
	"published_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug"),
	CONSTRAINT "events_ends_after_start" CHECK ("events"."ends_at" > "events"."starts_at"),
	CONSTRAINT "events_capacity_positive" CHECK ("events"."capacity" > 0),
	CONSTRAINT "events_price_non_negative" CHECK ("events"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_status_starts_at_idx" ON "events" USING btree ("status","starts_at");