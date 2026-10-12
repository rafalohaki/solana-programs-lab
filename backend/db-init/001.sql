-- Manual DDL for the backend Postgres store. Must match
-- backend/src/db/schema.ts exactly (drizzle pgTable definitions).
CREATE TABLE IF NOT EXISTS invoice_metadata (
  invoice TEXT PRIMARY KEY,
  plan TEXT,
  subscription TEXT,
  merchant TEXT,
  invoice_id BIGINT,
  memo_hash TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoice_charges (
  id SERIAL PRIMARY KEY,
  invoice TEXT,
  signature TEXT UNIQUE,
  amount BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
