CREATE TABLE "demo_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_state_single_row" CHECK ("demo_state"."id" = 1)
);
