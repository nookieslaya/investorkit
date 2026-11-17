CREATE UNIQUE INDEX "instrument_id_owner" ON "instruments" USING btree ("id","owner_id");
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"instrument_id" uuid,
	"decided_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"horizon" text DEFAULT '' NOT NULL,
	"thesis" text NOT NULL,
	"risks" text DEFAULT '' NOT NULL,
	"review_conditions" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_revision" CHECK ("journal_entries"."revision" >= 1),
	CONSTRAINT "journal_reason" CHECK (char_length(trim("journal_entries"."reason")) BETWEEN 1 AND 500),
	CONSTRAINT "journal_thesis" CHECK (char_length(trim("journal_entries"."thesis")) BETWEEN 1 AND 5000),
	CONSTRAINT "journal_text_lengths" CHECK (char_length("journal_entries"."horizon") <= 500 AND char_length("journal_entries"."risks") <= 3000 AND char_length("journal_entries"."review_conditions") <= 3000 AND char_length("journal_entries"."notes") <= 10000)
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_portfolio_id_owner_id_portfolios_id_owner_id_fk" FOREIGN KEY ("portfolio_id","owner_id") REFERENCES "public"."portfolios"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_instrument_id_owner_id_instruments_id_owner_id_fk" FOREIGN KEY ("instrument_id","owner_id") REFERENCES "public"."instruments"("id","owner_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_owner_portfolio_date" ON "journal_entries" USING btree ("owner_id","portfolio_id","decided_at");
