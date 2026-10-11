CREATE TYPE "public"."audit_action" AS ENUM('user_suspended', 'user_reinstated', 'wallet_adjusted');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'account_reinstated';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'wallet_adjusted';--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" "audit_action" NOT NULL,
	"target_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"amount_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_target_created_idx" ON "audit_log" USING btree ("target_user_id","created_at");