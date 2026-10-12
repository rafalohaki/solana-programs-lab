-- One-time payments (Stripe-style payment links). Must match
-- backend/src/db/schema.ts (payments) exactly — one row per confirmed
-- on-chain transfer, written only after the transaction signature has been
-- verified against the cluster; signature UNIQUE dedupes replays (409).
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  merchant TEXT NOT NULL,
  mint TEXT,
  amount BIGINT NOT NULL,
  memo TEXT,
  signature TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Merchant rollup support (GET /api/payments?merchant= filters by merchant).
CREATE INDEX IF NOT EXISTS payments_merchant_idx ON payments (merchant);
