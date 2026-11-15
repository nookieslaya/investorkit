CREATE TABLE "cash_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"sequence" bigserial NOT NULL,
	"kind" text NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(28, 10) NOT NULL,
	"fx_to_base" numeric(28, 12) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"fx_as_of" timestamp with time zone NOT NULL,
	"fx_source" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_kind" CHECK ("cash_operations"."kind" IN ('DEPOSIT','WITHDRAWAL')),
	CONSTRAINT "cash_currency" CHECK ("cash_operations"."currency" IN ('PLN','EUR','USD')),
	CONSTRAINT "cash_amount_positive" CHECK ("cash_operations"."amount" > 0),
	CONSTRAINT "cash_fx_positive" CHECK ("cash_operations"."fx_to_base" > 0),
	CONSTRAINT "cash_pln_fx" CHECK ("cash_operations"."currency" <> 'PLN' OR "cash_operations"."fx_to_base" = 1),
	CONSTRAINT "cash_fx_date" CHECK ("cash_operations"."fx_as_of" <= "cash_operations"."occurred_at"),
	CONSTRAINT "cash_fx_source" CHECK ("cash_operations"."fx_source" = 'manual'),
	CONSTRAINT "cash_note_length" CHECK (char_length("cash_operations"."note") <= 300)
);
--> statement-breakpoint
ALTER TABLE "cash_operations" ADD CONSTRAINT "cash_operations_portfolio_id_owner_id_portfolios_id_owner_id_fk" FOREIGN KEY ("portfolio_id","owner_id") REFERENCES "public"."portfolios"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_idempotency" ON "cash_operations" USING btree ("portfolio_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "cash_owner_portfolio" ON "cash_operations" USING btree ("owner_id","portfolio_id");