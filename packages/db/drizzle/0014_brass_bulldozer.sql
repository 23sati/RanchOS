ALTER TABLE "notification_deliveries" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "last_attempt_at" timestamp with time zone;
