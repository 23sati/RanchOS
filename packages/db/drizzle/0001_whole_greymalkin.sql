CREATE TABLE "application_records" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"task_id" uuid,
	"record_type" text NOT NULL,
	"applicator_name" text NOT NULL,
	"applicator_license" text,
	"product_id" uuid,
	"product_name_manual" text,
	"epa_reg_number" text,
	"rate_per_acre" numeric(10, 4),
	"rate_unit" text,
	"total_product_used" numeric(10, 4),
	"total_product_unit" text,
	"water_volume_gpa" numeric(8, 2),
	"applied_date" date NOT NULL,
	"applied_start_time" text,
	"applied_end_time" text,
	"wind_speed_mph" numeric(5, 2),
	"wind_direction" text,
	"temp_f" numeric(5, 2),
	"target_pest" text,
	"target_pest_scouting_log_id" uuid,
	"acres_treated" numeric(10, 2) NOT NULL,
	"equipment_used" text,
	"rei_expiry" timestamp with time zone,
	"phi_expiry" date,
	"is_organic_block" boolean DEFAULT false NOT NULL,
	"omri_confirmed" boolean DEFAULT false,
	"certifier_notified" boolean DEFAULT false,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "crew_members" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"profile_id" uuid,
	"full_name" text NOT NULL,
	"phone" text,
	"employee_id" text,
	"hire_date" date,
	"position" text,
	"pay_type" text,
	"hourly_rate" numeric(8, 2),
	"h2a_worker" boolean DEFAULT false,
	"h2a_disclaimer_acknowledged" boolean DEFAULT false,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "harvest_events" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"block_season_id" uuid,
	"harvest_date" date NOT NULL,
	"harvest_method" text,
	"total_pounds" numeric(12, 2),
	"total_bins" integer,
	"bin_weight_lbs" numeric(8, 2) DEFAULT '1000',
	"picker_count" integer,
	"crew_ids" uuid[] DEFAULT '{}',
	"hulled_weight_lbs" numeric(12, 2),
	"hull_split_pct" numeric(5, 2),
	"brix" numeric(5, 2),
	"acid_ratio" numeric(6, 3),
	"handler_name" text,
	"load_ticket" text,
	"handler_ticket_reconciled" boolean DEFAULT false,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "labor_entries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"crew_member_id" uuid NOT NULL,
	"task_id" uuid,
	"block_id" uuid,
	"work_date" date NOT NULL,
	"clock_in" timestamp with time zone,
	"clock_out" timestamp with time zone,
	"hours_worked" numeric(5, 2),
	"clock_in_gps_lat" numeric(10, 8),
	"clock_in_gps_lng" numeric(11, 8),
	"clock_out_gps_lat" numeric(10, 8),
	"clock_out_gps_lng" numeric(11, 8),
	"piece_rate_type" text,
	"piece_rate_quantity" numeric(10, 2),
	"piece_rate_per_unit" numeric(8, 4),
	"gross_pay" numeric(10, 2),
	"notes" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "org_integrations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"integration_type" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"realm_id" text,
	"settings" jsonb DEFAULT '{}',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"cdms_id" text,
	"epa_reg_number" text,
	"cdfa_reg_number" text,
	"dpr_product_id" text,
	"product_name" text NOT NULL,
	"manufacturer" text,
	"active_ingredients" jsonb,
	"rei_hours" integer,
	"phi_days" integer,
	"formulation" text,
	"applicable_crops" text[],
	"target_pests" text[],
	"restricted_use" boolean DEFAULT false,
	"is_omri_listed" boolean DEFAULT false,
	"is_cdfa_organic" boolean DEFAULT false,
	"organic_approved_states" text[] DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "products_cdms_id_unique" UNIQUE("cdms_id")
);
--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_target_pest_scouting_log_id_scouting_logs_id_fk" FOREIGN KEY ("target_pest_scouting_log_id") REFERENCES "public"."scouting_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_events" ADD CONSTRAINT "harvest_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_events" ADD CONSTRAINT "harvest_events_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_events" ADD CONSTRAINT "harvest_events_block_season_id_block_seasons_id_fk" FOREIGN KEY ("block_season_id") REFERENCES "public"."block_seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_events" ADD CONSTRAINT "harvest_events_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_entries" ADD CONSTRAINT "labor_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_entries" ADD CONSTRAINT "labor_entries_crew_member_id_crew_members_id_fk" FOREIGN KEY ("crew_member_id") REFERENCES "public"."crew_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_entries" ADD CONSTRAINT "labor_entries_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_entries" ADD CONSTRAINT "labor_entries_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_entries" ADD CONSTRAINT "labor_entries_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "labor_entries" ADD CONSTRAINT "labor_entries_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_integrations" ADD CONSTRAINT "org_integrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_records_org_date_idx" ON "application_records" USING btree ("org_id","applied_date");--> statement-breakpoint
CREATE INDEX "app_records_block_idx" ON "application_records" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "crew_members_org_idx" ON "crew_members" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX "labor_entries_crew_date_idx" ON "labor_entries" USING btree ("crew_member_id","work_date");--> statement-breakpoint
CREATE INDEX "labor_entries_org_date_idx" ON "labor_entries" USING btree ("org_id","work_date");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("product_name");--> statement-breakpoint
CREATE INDEX "products_organic_idx" ON "products" USING btree ("is_omri_listed","is_cdfa_organic");