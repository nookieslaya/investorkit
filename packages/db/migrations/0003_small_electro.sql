CREATE TABLE "risk_settings" (
	"portfolio_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"max_position_pct" numeric(13, 10) NOT NULL,
	"top3_pct" numeric(13, 10) NOT NULL,
	"top5_pct" numeric(13, 10) NOT NULL,
	"quote_max_age_hours" integer NOT NULL,
	"fx_max_age_hours" integer NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_thresholds" CHECK ("risk_settings"."max_position_pct" BETWEEN 0 AND 100 AND "risk_settings"."top3_pct" BETWEEN "risk_settings"."max_position_pct" AND 100 AND "risk_settings"."top5_pct" BETWEEN "risk_settings"."top3_pct" AND 100),
	CONSTRAINT "risk_freshness" CHECK ("risk_settings"."quote_max_age_hours" BETWEEN 1 AND 8760 AND "risk_settings"."fx_max_age_hours" BETWEEN 1 AND 8760),
	CONSTRAINT "risk_revision" CHECK ("risk_settings"."revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "risk_settings" ADD CONSTRAINT "risk_settings_portfolio_id_owner_id_portfolios_id_owner_id_fk" FOREIGN KEY ("portfolio_id","owner_id") REFERENCES "public"."portfolios"("id","owner_id") ON DELETE cascade ON UPDATE no action;