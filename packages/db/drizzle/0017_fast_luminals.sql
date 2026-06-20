CREATE TABLE "product_inventory_links" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"updated_by" uuid,
	CONSTRAINT "product_inventory_links_org_product_unq" UNIQUE("org_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "application_records" ADD COLUMN "source_inventory_stock_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "application_record_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "label_url" text;--> statement-breakpoint
ALTER TABLE "product_inventory_links" ADD CONSTRAINT "product_inventory_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_inventory_links" ADD CONSTRAINT "product_inventory_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_inventory_links" ADD CONSTRAINT "product_inventory_links_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_inventory_links" ADD CONSTRAINT "product_inventory_links_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_inventory_links_org_inventory_idx" ON "product_inventory_links" USING btree ("org_id","inventory_item_id");--> statement-breakpoint
ALTER TABLE "application_records" ADD CONSTRAINT "application_records_source_inventory_stock_id_inventory_stocks_id_fk" FOREIGN KEY ("source_inventory_stock_id") REFERENCES "public"."inventory_stocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_application_record_id_application_records_id_fk" FOREIGN KEY ("application_record_id") REFERENCES "public"."application_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_application_record_unq" UNIQUE("application_record_id");