CREATE TYPE "public"."block_crop_type" AS ENUM('almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit');--> statement-breakpoint
CREATE TYPE "public"."county" AS ENUM('Fresno', 'Tulare', 'Kings', 'Kern', 'Madera', 'Merced', 'San Joaquin', 'San Bernardino', 'Riverside', 'Ventura');--> statement-breakpoint
CREATE TYPE "public"."irrigation_type" AS ENUM('drip', 'micro_spray', 'flood', 'overhead');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'overdue');--> statement-breakpoint
CREATE TABLE "block_seasons" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"block_id" uuid NOT NULL,
	"season_year" integer NOT NULL,
	"bloom_date" date,
	"hull_split_start" date,
	"harvest_start" date,
	"harvest_end" date,
	"total_yield_lbs" numeric(12, 2),
	"yield_per_acre" numeric(8, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "block_seasons_block_id_season_year_unique" UNIQUE("block_id","season_year")
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"ranch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"crop_type" text NOT NULL,
	"variety" text NOT NULL,
	"acreage" numeric(10, 2),
	"tree_count" integer,
	"year_planted" integer,
	"rootstock" text,
	"irrigation_type" text,
	"geometry" geometry(point),
	"is_organic" boolean DEFAULT false NOT NULL,
	"organic_since" date,
	"apn" text,
	"water_district" text,
	"gsa_name" text,
	"notes" text,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "ranches" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"county" text,
	"address" text,
	"gps_lat" numeric(10, 8),
	"gps_lng" numeric(11, 8),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_assignments" (
	"task_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "task_assignments_task_id_profile_id_pk" PRIMARY KEY("task_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "task_blocks" (
	"task_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	CONSTRAINT "task_blocks_task_id_block_id_pk" PRIMARY KEY("task_id","block_id")
);
--> statement-breakpoint
CREATE TABLE "task_types" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid,
	"name_en" text NOT NULL,
	"name_es" text NOT NULL,
	"color" text DEFAULT '#6B7280' NOT NULL,
	"icon" text,
	"is_system" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"task_type_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"created_by" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"completion_notes" text,
	"completion_photo_urls" text[] DEFAULT '{}',
	"completion_gps_lat" numeric(10, 8),
	"completion_gps_lng" numeric(11, 8),
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "block_seasons" ADD CONSTRAINT "block_seasons_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_ranch_id_ranches_id_fk" FOREIGN KEY ("ranch_id") REFERENCES "public"."ranches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranches" ADD CONSTRAINT "ranches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_blocks" ADD CONSTRAINT "task_blocks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_blocks" ADD CONSTRAINT "task_blocks_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_types" ADD CONSTRAINT "task_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_task_type_id_task_types_id_fk" FOREIGN KEY ("task_type_id") REFERENCES "public"."task_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_by_profiles_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_org_id_idx" ON "blocks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "blocks_ranch_id_idx" ON "blocks" USING btree ("ranch_id");--> statement-breakpoint
CREATE INDEX "blocks_geometry_idx" ON "blocks" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX "blocks_is_organic_idx" ON "blocks" USING btree ("org_id","is_organic");--> statement-breakpoint
CREATE INDEX "ranches_org_id_idx" ON "ranches" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "task_assignments_profile_id_idx" ON "task_assignments" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "task_blocks_block_id_idx" ON "task_blocks" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "tasks_org_id_status_idx" ON "tasks" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("org_id","due_date");