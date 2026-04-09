ALTER TABLE "notification_deliveries" ADD COLUMN "provider_message_id" text;
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD COLUMN "receipt_checked_at" timestamp with time zone;
