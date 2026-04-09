CREATE TABLE "weather_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"station_id" integer NOT NULL,
	"forecast_date" date NOT NULL,
	"source" text DEFAULT 'open_meteo' NOT NULL,
	"eto_inches" numeric(6, 4),
	"max_temp_f" numeric(5, 2),
	"min_temp_f" numeric(5, 2),
	"precipitation_probability_pct" numeric(5, 2),
	"wind_speed_mph" numeric(6, 2),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "weather_forecasts_station_id_forecast_date_source_unique" UNIQUE("station_id","forecast_date","source")
);
--> statement-breakpoint
ALTER TABLE "weather_forecasts" ADD CONSTRAINT "weather_forecasts_station_id_cimis_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."cimis_stations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "weather_forecasts_station_date_idx" ON "weather_forecasts" USING btree ("station_id","forecast_date");
