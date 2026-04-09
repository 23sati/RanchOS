ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
--> statement-breakpoint
ALTER TABLE "verifications" ALTER COLUMN "id" SET DEFAULT uuid_generate_v4();
