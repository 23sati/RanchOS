CREATE TABLE "agworld_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"sync_type" text NOT NULL,
	"agworld_id" text,
	"ranchos_id" uuid,
	"direction" text,
	"status" text,
	"error_message" text,
	"synced_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"block_id" uuid NOT NULL,
	"recommendation_type" text NOT NULL,
	"title_en" text NOT NULL,
	"title_es" text NOT NULL,
	"body_en" text NOT NULL,
	"body_es" text NOT NULL,
	"urgency" text,
	"data_inputs" jsonb,
	"dismissed_at" timestamp with time zone,
	"acted_on_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"name" text NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "degree_day_records" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"cimis_station_id" integer NOT NULL,
	"pest_model" text NOT NULL,
	"date" date NOT NULL,
	"daily_dd" numeric(8, 4),
	"cumulative_dd" numeric(10, 4),
	"biofix_date" date,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "degree_day_records_cimis_station_id_pest_model_date_unique" UNIQUE("cimis_station_id","pest_model","date")
);
--> statement-breakpoint
CREATE TABLE "handler_ticket_imports" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"harvest_event_id" uuid,
	"import_date" timestamp with time zone NOT NULL,
	"handler_name" text NOT NULL,
	"load_ticket" text NOT NULL,
	"ticket_date" date,
	"net_pounds" numeric(12, 2),
	"gross_pounds" numeric(12, 2),
	"moisture_pct" numeric(5, 2),
	"hulled_weight_lbs" numeric(12, 2),
	"price_per_pound" numeric(8, 4),
	"gross_value" numeric(12, 2),
	"status" text DEFAULT 'unmatched',
	"discrepancy_notes" text,
	"imported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "agworld_sync_log" ADD CONSTRAINT "agworld_sync_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "degree_day_records" ADD CONSTRAINT "degree_day_records_cimis_station_id_cimis_stations_id_fk" FOREIGN KEY ("cimis_station_id") REFERENCES "public"."cimis_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handler_ticket_imports" ADD CONSTRAINT "handler_ticket_imports_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handler_ticket_imports" ADD CONSTRAINT "handler_ticket_imports_harvest_event_id_harvest_events_id_fk" FOREIGN KEY ("harvest_event_id") REFERENCES "public"."harvest_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handler_ticket_imports" ADD CONSTRAINT "handler_ticket_imports_imported_by_profiles_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_recs_org_block_idx" ON "ai_recommendations" USING btree ("org_id","block_id","created_at");--> statement-breakpoint
CREATE INDEX "dd_records_station_model_idx" ON "degree_day_records" USING btree ("cimis_station_id","pest_model","date");