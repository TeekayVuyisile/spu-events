ALTER TABLE "events" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_location_complete" CHECK (("events"."latitude" is null) = ("events"."longitude" is null) and ("events"."latitude" is null) = ("events"."address" is null));