CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"currency" text NOT NULL,
	"base_currency" text NOT NULL,
	"rate" numeric(28, 12) NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"sequence" bigserial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_positive" CHECK ("fx_rates"."rate" > 0),
	CONSTRAINT "fx_currency" CHECK ("fx_rates"."currency" IN ('PLN','EUR','USD') AND "fx_rates"."base_currency" = 'PLN'),
	CONSTRAINT "fx_pln" CHECK ("fx_rates"."currency" <> 'PLN' OR "fx_rates"."rate" = 1),
	CONSTRAINT "fx_source" CHECK ("fx_rates"."source" = 'manual')
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"type" text NOT NULL,
	"symbol" text NOT NULL,
	"mic" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"quantity_scale" integer NOT NULL,
	"isin" text,
	"issuer_country" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instrument_type" CHECK ("instruments"."type" IN ('STOCK','ETF')),
	CONSTRAINT "instrument_currency" CHECK ("instruments"."currency" IN ('PLN','EUR','USD')),
	CONSTRAINT "instrument_scale" CHECK ("instruments"."quantity_scale" BETWEEN 0 AND 10),
	CONSTRAINT "instrument_name" CHECK (char_length(trim("instruments"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "instrument_symbol" CHECK ("instruments"."symbol" ~ '^[A-Z0-9._-]{1,24}$'),
	CONSTRAINT "instrument_mic" CHECK ("instruments"."mic" ~ '^[A-Z0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "manual_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"instrument_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"price" numeric(28, 10) NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"sequence" bigserial NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_price" CHECK ("manual_quotes"."price" >= 0),
	CONSTRAINT "quote_source" CHECK ("manual_quotes"."source" = 'manual')
);
--> statement-breakpoint
ALTER TABLE "cash_operations" DROP CONSTRAINT "cash_kind";--> statement-breakpoint
ALTER TABLE "cash_operations" ALTER COLUMN "amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_operations" ADD COLUMN "instrument_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_operations" ADD COLUMN "quantity" numeric(28, 10);--> statement-breakpoint
ALTER TABLE "cash_operations" ADD COLUMN "unit_price" numeric(28, 10);--> statement-breakpoint
ALTER TABLE "cash_operations" ADD COLUMN "commission" numeric(28, 10);--> statement-breakpoint
ALTER TABLE "cash_operations" ADD COLUMN "commission_currency" text;--> statement-breakpoint
ALTER TABLE "fx_rates" ADD CONSTRAINT "fx_rates_owner_id_auth_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instruments" ADD CONSTRAINT "instruments_owner_id_auth_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_owner_currency" ON "instruments" USING btree ("id","owner_id","currency");--> statement-breakpoint
ALTER TABLE "manual_quotes" ADD CONSTRAINT "manual_quotes_instrument_id_owner_id_currency_instruments_id_owner_id_currency_fk" FOREIGN KEY ("instrument_id","owner_id","currency") REFERENCES "public"."instruments"("id","owner_id","currency") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fx_owner_date" ON "fx_rates" USING btree ("owner_id","currency","as_of");--> statement-breakpoint
CREATE UNIQUE INDEX "instrument_identity" ON "instruments" USING btree ("owner_id","symbol","mic","currency");--> statement-breakpoint
CREATE INDEX "quote_owner_instrument" ON "manual_quotes" USING btree ("owner_id","instrument_id","as_of");--> statement-breakpoint
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_instrument_id_owner_id_currency_instruments_id_owner_id_currency_fk" FOREIGN KEY ("instrument_id","owner_id","currency") REFERENCES "public"."instruments"("id","owner_id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_sequence" ON "cash_operations" USING btree ("portfolio_id","sequence");--> statement-breakpoint
ALTER TABLE "cash_operations" ADD CONSTRAINT "ledger_fields" CHECK (("cash_operations"."kind" IN ('DEPOSIT','WITHDRAWAL') AND "cash_operations"."amount" IS NOT NULL AND "cash_operations"."instrument_id" IS NULL AND "cash_operations"."quantity" IS NULL AND "cash_operations"."unit_price" IS NULL AND "cash_operations"."commission" IS NULL AND "cash_operations"."commission_currency" IS NULL) OR ("cash_operations"."kind" IN ('BUY','SELL') AND "cash_operations"."amount" IS NULL AND "cash_operations"."instrument_id" IS NOT NULL AND "cash_operations"."quantity" > 0 AND "cash_operations"."quantity" IS NOT NULL AND "cash_operations"."unit_price" > 0 AND "cash_operations"."unit_price" IS NOT NULL AND "cash_operations"."commission" >= 0 AND "cash_operations"."commission" IS NOT NULL AND "cash_operations"."commission_currency" = "cash_operations"."currency" AND "cash_operations"."commission_currency" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_kind" CHECK ("cash_operations"."kind" IN ('DEPOSIT','WITHDRAWAL','BUY','SELL'));