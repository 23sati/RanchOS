CREATE TYPE "public"."inventory_category" AS ENUM('fertilizer', 'pesticide', 'soil_amendment', 'fuel', 'irrigation', 'parts', 'packaging', 'tool', 'safety', 'other');
--> statement-breakpoint
CREATE TYPE "public"."inventory_location_type" AS ENUM('warehouse', 'shop', 'yard', 'field', 'vehicle', 'cold_storage', 'other');
--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('purchase', 'transfer', 'usage', 'adjustment_in', 'adjustment_out', 'return', 'waste');
--> statement-breakpoint
CREATE TYPE "public"."inventory_unit" AS ENUM('gallon', 'quart', 'pound', 'ounce', 'ton', 'bag', 'case', 'each', 'foot', 'bin');
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"manufacturer" text,
	"supplier" text,
	"description" text,
	"storage_notes" text,
	"reorder_point" numeric(12, 2) DEFAULT '0' NOT NULL,
	"target_stock" numeric(12, 2),
	"default_unit_cost" numeric(12, 2),
	"lot_tracking" boolean DEFAULT true NOT NULL,
	"restricted_use" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid,
	CONSTRAINT "inventory_items_org_sku_unq" UNIQUE("org_id","sku")
);
--> statement-breakpoint
CREATE TABLE "inventory_locations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"ranch_id" uuid,
	"name" text NOT NULL,
	"code" text,
	"location_type" text DEFAULT 'warehouse' NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid,
	CONSTRAINT "inventory_locations_org_code_unq" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "inventory_stocks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"lot_code" text,
	"expiration_date" date,
	"received_date" date,
	"quantity_on_hand" numeric(12, 2) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(12, 2),
	"vendor_name" text,
	"reference_number" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_movement_at" timestamp with time zone DEFAULT now(),
	"last_counted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"movement_type" text NOT NULL,
	"from_stock_id" uuid,
	"to_stock_id" uuid,
	"from_location_id" uuid,
	"to_location_id" uuid,
	"block_id" uuid,
	"quantity" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2),
	"lot_code" text,
	"expiration_date" date,
	"reference_number" text,
	"vendor_name" text,
	"notes" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"performed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_ranch_id_ranches_id_fk" FOREIGN KEY ("ranch_id") REFERENCES "public"."ranches"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_stocks" ADD CONSTRAINT "inventory_stocks_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_from_stock_id_inventory_stocks_id_fk" FOREIGN KEY ("from_stock_id") REFERENCES "public"."inventory_stocks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_to_stock_id_inventory_stocks_id_fk" FOREIGN KEY ("to_stock_id") REFERENCES "public"."inventory_stocks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_from_location_id_inventory_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_to_location_id_inventory_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_profiles_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "inventory_items_org_category_idx" ON "inventory_items" USING btree ("org_id","category","active");
--> statement-breakpoint
CREATE INDEX "inventory_locations_org_active_idx" ON "inventory_locations" USING btree ("org_id","active");
--> statement-breakpoint
CREATE INDEX "inventory_locations_ranch_idx" ON "inventory_locations" USING btree ("ranch_id");
--> statement-breakpoint
CREATE INDEX "inventory_stocks_org_item_idx" ON "inventory_stocks" USING btree ("org_id","item_id");
--> statement-breakpoint
CREATE INDEX "inventory_stocks_location_idx" ON "inventory_stocks" USING btree ("location_id");
--> statement-breakpoint
CREATE INDEX "inventory_stocks_expiration_idx" ON "inventory_stocks" USING btree ("org_id","expiration_date");
--> statement-breakpoint
CREATE INDEX "inventory_movements_org_occurred_idx" ON "inventory_movements" USING btree ("org_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "inventory_movements_item_idx" ON "inventory_movements" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "inventory_movements_block_idx" ON "inventory_movements" USING btree ("block_id");
