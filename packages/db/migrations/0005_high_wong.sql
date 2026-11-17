CREATE TABLE "valuation_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"value_base" numeric(28, 10),
	"net_contributions_base" numeric(28, 10) NOT NULL,
	"complete" boolean NOT NULL,
	"inputs_hash" text NOT NULL,
	"engine_version" text NOT NULL,
	"valuation" jsonb NOT NULL,
	CONSTRAINT "snapshot_completeness" CHECK (("valuation_snapshots"."complete" AND "valuation_snapshots"."value_base" IS NOT NULL AND "valuation_snapshots"."value_base" >= 0) OR (NOT "valuation_snapshots"."complete" AND "valuation_snapshots"."value_base" IS NULL)),
	CONSTRAINT "snapshot_hash" CHECK ("valuation_snapshots"."inputs_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "snapshot_engine" CHECK (char_length("valuation_snapshots"."engine_version") BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "valuation_snapshots" ADD CONSTRAINT "valuation_snapshots_portfolio_id_owner_id_portfolios_id_owner_id_fk" FOREIGN KEY ("portfolio_id","owner_id") REFERENCES "public"."portfolios"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_point_inputs" ON "valuation_snapshots" USING btree ("portfolio_id","as_of","inputs_hash");--> statement-breakpoint
CREATE INDEX "snapshot_owner_portfolio_date" ON "valuation_snapshots" USING btree ("owner_id","portfolio_id","as_of");