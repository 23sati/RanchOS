CREATE EXTENSION IF NOT EXISTS "uuid-ossp";--> statement-breakpoint
CREATE TYPE "public"."block_crop_type" AS ENUM('almond', 'navel_orange', 'valencia_orange', 'lemon', 'mandarin', 'grapefruit');--> statement-breakpoint
CREATE TYPE "public"."certification_body" AS ENUM('ccof', 'ocia', 'oregon_tilth', 'primus', 'other');--> statement-breakpoint
CREATE TYPE "public"."county" AS ENUM('Fresno', 'Tulare', 'Kings', 'Kern', 'Madera', 'Merced', 'San Joaquin', 'San Bernardino', 'Riverside', 'Ventura');--> statement-breakpoint
CREATE TYPE "public"."primary_crop" AS ENUM('almond', 'citrus', 'both');--> statement-breakpoint
CREATE TYPE "public"."irrigation_type" AS ENUM('drip', 'micro_spray', 'flood', 'overhead');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'es');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('starter', 'growth', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'manager', 'crew');--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"block_id" uuid,
	"rule_type" text NOT NULL,
	"metric" text NOT NULL,
	"operator" text NOT NULL,
	"threshold_value" numeric(12, 4) NOT NULL,
	"notification_channels" text[] DEFAULT ARRAY['push','email'],
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "block_irrigation_config" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"block_id" uuid NOT NULL,
	"cimis_station_id" integer,
	"soil_type" text,
	"emitter_flow_gph" numeric(6, 3),
	"emitters_per_tree" integer,
	"tree_spacing_ft" numeric(6, 2),
	"row_spacing_ft" numeric(6, 2),
	"deficit_trigger_inches" numeric(4, 2) DEFAULT '1.5',
	"kc_jan" numeric(4, 3),
	"kc_feb" numeric(4, 3),
	"kc_mar" numeric(4, 3),
	"kc_apr" numeric(4, 3),
	"kc_may" numeric(4, 3),
	"kc_jun" numeric(4, 3),
	"kc_jul" numeric(4, 3),
	"kc_aug" numeric(4, 3),
	"kc_sep" numeric(4, 3),
	"kc_oct" numeric(4, 3),
	"kc_nov" numeric(4, 3),
	"kc_dec" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "block_irrigation_config_block_id_unique" UNIQUE("block_id")
);
--> statement-breakpoint
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
	"geometry" jsonb,
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
CREATE TABLE "cimis_stations" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"county" text,
	"lat" numeric(10, 8),
	"lng" numeric(11, 8),
	"is_active" boolean DEFAULT true,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "et_data" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"station_id" integer NOT NULL,
	"date" date NOT NULL,
	"eto_mm" numeric(6, 3),
	"eto_inches" numeric(6, 4),
	"max_temp_f" numeric(5, 2),
	"min_temp_f" numeric(5, 2),
	"avg_temp_f" numeric(5, 2),
	"wind_speed_mph" numeric(6, 2),
	"solar_radiation" numeric(8, 3),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "et_data_station_id_date_unique" UNIQUE("station_id","date")
);
--> statement-breakpoint
CREATE TABLE "frost_alert_config" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false,
	"warning_temp_f" numeric(4, 1) DEFAULT '34.0',
	"danger_temp_f" numeric(4, 1) DEFAULT '29.0',
	"monitor_hours" jsonb DEFAULT '{"start": 22, "end": 8}',
	"notify_profiles" uuid[] DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "frost_alert_config_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "irrigation_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"scheduled_date" date NOT NULL,
	"scheduled_start_time" text,
	"planned_runtime_hours" numeric(5, 2) NOT NULL,
	"planned_flow_rate_gpm" numeric(8, 3),
	"actual_runtime_hours" numeric(5, 2),
	"actual_flow_rate_gpm" numeric(8, 3),
	"water_applied_acre_inches" numeric(8, 4),
	"status" text DEFAULT 'scheduled' NOT NULL,
	"et_deficit_inches" numeric(6, 4),
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"primary_crop" text,
	"has_organic_blocks" boolean DEFAULT false,
	"certification_body" text,
	"certification_number" text,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "pest_species" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name_en" text NOT NULL,
	"name_es" text NOT NULL,
	"name_scientific" text,
	"category" text NOT NULL,
	"applicable_crops" text[] NOT NULL,
	"action_threshold_description" text,
	"is_allowed_in_organic" boolean DEFAULT false,
	"uc_ipm_url" text,
	"is_system" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"role" text NOT NULL,
	"preferred_locale" text DEFAULT 'en' NOT NULL,
	"phone" text,
	"avatar_url" text,
	"expo_push_token" text,
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
CREATE TABLE "scouting_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"scouted_by" uuid NOT NULL,
	"scouted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pest_species_id" uuid,
	"pest_name_custom" text,
	"rating" text,
	"count_per_sample" numeric(8, 2),
	"sample_count" integer,
	"observation_notes" text,
	"photo_urls" text[] DEFAULT '{}',
	"gps_lat" numeric(10, 8),
	"gps_lng" numeric(11, 8),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'starter' NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"total_acres" numeric(10, 2),
	"mobile_seats" text DEFAULT '5',
	"monthly_amount_cents" text,
	"trial_ends_at" timestamp with time zone DEFAULT NOW() + INTERVAL '14 days',
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
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
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_irrigation_config" ADD CONSTRAINT "block_irrigation_config_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_irrigation_config" ADD CONSTRAINT "block_irrigation_config_cimis_station_id_cimis_stations_id_fk" FOREIGN KEY ("cimis_station_id") REFERENCES "public"."cimis_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "block_seasons" ADD CONSTRAINT "block_seasons_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_ranch_id_ranches_id_fk" FOREIGN KEY ("ranch_id") REFERENCES "public"."ranches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "et_data" ADD CONSTRAINT "et_data_station_id_cimis_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."cimis_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frost_alert_config" ADD CONSTRAINT "frost_alert_config_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irrigation_events" ADD CONSTRAINT "irrigation_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irrigation_events" ADD CONSTRAINT "irrigation_events_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irrigation_events" ADD CONSTRAINT "irrigation_events_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "irrigation_events" ADD CONSTRAINT "irrigation_events_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranches" ADD CONSTRAINT "ranches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouting_logs" ADD CONSTRAINT "scouting_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouting_logs" ADD CONSTRAINT "scouting_logs_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouting_logs" ADD CONSTRAINT "scouting_logs_scouted_by_profiles_id_fk" FOREIGN KEY ("scouted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scouting_logs" ADD CONSTRAINT "scouting_logs_pest_species_id_pest_species_id_fk" FOREIGN KEY ("pest_species_id") REFERENCES "public"."pest_species"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "blocks_is_organic_idx" ON "blocks" USING btree ("org_id","is_organic");--> statement-breakpoint
CREATE INDEX "et_data_station_date_idx" ON "et_data" USING btree ("station_id","date");--> statement-breakpoint
CREATE INDEX "irrigation_events_block_date_idx" ON "irrigation_events" USING btree ("block_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "profiles_org_id_idx" ON "profiles" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "profiles_role_idx" ON "profiles" USING btree ("org_id","role");--> statement-breakpoint
CREATE INDEX "ranches_org_id_idx" ON "ranches" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "scouting_logs_block_at_idx" ON "scouting_logs" USING btree ("block_id","scouted_at");--> statement-breakpoint
CREATE INDEX "task_assignments_profile_id_idx" ON "task_assignments" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "task_blocks_block_id_idx" ON "task_blocks" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "tasks_org_id_status_idx" ON "tasks" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("org_id","due_date");
