CREATE TABLE "market_bindings" (
	"instrument_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"symbol" text NOT NULL,
	"mic" text NOT NULL,
	"currency" text NOT NULL,
	"mode" text NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"status" text DEFAULT 'ready' NOT NULL,
	CONSTRAINT "market_binding_mode" CHECK ("market_bindings"."mode" IN ('manual','marketstack')),
	CONSTRAINT "market_binding_symbol" CHECK ("market_bindings"."symbol" ~ '^[A-Za-z0-9.^:_/-]{1,64}$'),
	CONSTRAINT "market_binding_mic" CHECK ("market_bindings"."mic" ~ '^[A-Z0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "market_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"blocked" text,
	CONSTRAINT "market_budget_used" CHECK ("market_budget"."used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "market_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instrument_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"currency" text NOT NULL,
	"symbol" text NOT NULL,
	"mic" text NOT NULL,
	"price" numeric(28, 10) NOT NULL,
	"source" text DEFAULT 'marketstack' NOT NULL,
	"session_date" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_quote_positive" CHECK ("market_quotes"."price" >= 0),
	CONSTRAINT "market_quote_source" CHECK ("market_quotes"."source" = 'marketstack')
);
--> statement-breakpoint
CREATE TABLE "market_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"query" text NOT NULL,
	"symbol" text NOT NULL,
	"mic" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"price" numeric(28, 10) NOT NULL,
	"session_date" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "market_selection_currency" CHECK ("market_selections"."currency" IN ('PLN','EUR','USD'))
);
--> statement-breakpoint
ALTER TABLE "market_bindings" ADD CONSTRAINT "market_bindings_instrument_id_owner_id_currency_instruments_id_owner_id_currency_fk" FOREIGN KEY ("instrument_id","owner_id","currency") REFERENCES "public"."instruments"("id","owner_id","currency") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_binding_owner" ON "market_bindings" USING btree ("instrument_id","owner_id","currency");--> statement-breakpoint
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_instrument_id_owner_id_currency_market_bindings_instrument_id_owner_id_currency_fk" FOREIGN KEY ("instrument_id","owner_id","currency") REFERENCES "public"."market_bindings"("instrument_id","owner_id","currency") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_selections" ADD CONSTRAINT "market_selections_owner_id_auth_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_quote_session" ON "market_quotes" USING btree ("instrument_id","symbol","mic","session_date");--> statement-breakpoint
CREATE INDEX "market_quote_owner" ON "market_quotes" USING btree ("owner_id","instrument_id","as_of");--> statement-breakpoint
CREATE INDEX "market_selection_owner_query" ON "market_selections" USING btree ("owner_id","query","mic");