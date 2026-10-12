import { bigint, index, jsonb, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Free-form invoice metadata JSONB (stored by POST /api/invoices/metadata).
 * Known keys are typed for the receipt flow; unknown keys stay allowed.
 */
export interface InvoiceMetadata {
  notifyEmail?: string;
  plan?: string;
  [key: string]: unknown;
}

/**
 * Drizzle schema — mirrors db-init/001.sql exactly. Keep both in sync:
 * invoice_metadata(invoice TEXT PK, plan TEXT, subscription TEXT,
 * merchant TEXT, invoice_id BIGINT, memo_hash TEXT, metadata JSONB,
 * created_at TIMESTAMPTZ), invoice_charges(id SERIAL PK, invoice TEXT,
 * signature TEXT UNIQUE, amount BIGINT, created_at).
 * Indexes live in db-init/003.sql and are re-declared below so drizzle
 * introspection stays in sync.
 */
export const invoiceMetadata = pgTable(
  "invoice_metadata",
  {
    invoice: text("invoice").primaryKey(),
    plan: text("plan"),
    subscription: text("subscription"),
    merchant: text("merchant"),
    invoiceId: bigint("invoice_id", { mode: "bigint" }),
    memoHash: text("memo_hash"),
    metadata: jsonb("metadata").$type<InvoiceMetadata>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("invoice_metadata_merchant_idx").on(t.merchant)],
);

export const invoiceCharges = pgTable(
  "invoice_charges",
  {
    id: serial("id").primaryKey(),
    invoice: text("invoice"),
    signature: text("signature").unique(),
    amount: bigint("amount", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("invoice_charges_invoice_idx").on(t.invoice)],
);

/**
 * Widget domain bindings — mirrors db-init/002.sql exactly. Keep both in sync:
 * widget_sites(merchant TEXT, domain TEXT, plan TEXT,
 * created_at TIMESTAMPTZ, PRIMARY KEY(merchant, domain)).
 */
export const widgetSites = pgTable(
  "widget_sites",
  {
    merchant: text("merchant").notNull(),
    domain: text("domain").notNull(),
    plan: text("plan").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.merchant, t.domain] })],
);

/**
 * One-time payments (Stripe-style payment links) — mirrors db-init/004.sql
 * exactly. Keep both in sync: payments(id SERIAL PK, merchant TEXT NOT NULL,
 * mint TEXT, amount BIGINT NOT NULL, memo TEXT, signature TEXT NOT NULL
 * UNIQUE, created_at TIMESTAMPTZ). One row per confirmed on-chain transfer,
 * written only through POST /api/payments/record after the signature has been
 * verified against the cluster; `signature` UNIQUE dedupes replays (409).
 */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    merchant: text("merchant").notNull(),
    mint: text("mint"),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    memo: text("memo"),
    signature: text("signature").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("payments_merchant_idx").on(t.merchant)],
);

/**
 * Plan metadata registry — mirrors db-init/005-plan-meta.sql exactly. Keep
 * both in sync: plan_metadata(plan TEXT PK, merchant TEXT NOT NULL,
 * title TEXT, description TEXT, category TEXT, handle TEXT,
 * created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ).
 *
 * Merchant-DECLARED display data for a plan card (title, description,
 * category badge, optional handle) — the on-chain plan account carries only
 * the numbers, this table carries the copy. Honesty contract: every field is
 * a merchant statement (like a product description in Stripe), never
 * verified on-chain and never fabricated server-side; rows exist only for
 * plans whose owner signed the write (POST /api/plans/meta verifies the
 * ed25519 signature AND the on-chain plan.merchant). `category` is one of
 * the fixed PlanCategory values ("saas" | "rpc" | "ai" | "community" |
 * "devtools") or NULL when the merchant did not pick one.
 */
export const planMetadata = pgTable(
  "plan_metadata",
  {
    /** Plan PDA (base58) — the same address the plan account lives at. */
    plan: text("plan").primaryKey(),
    /** Owning merchant (base58) — verified against the plan account on-chain. */
    merchant: text("merchant").notNull(),
    title: text("title"),
    description: text("description"),
    category: text("category"),
    handle: text("handle"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("plan_metadata_merchant_idx").on(t.merchant)],
);
