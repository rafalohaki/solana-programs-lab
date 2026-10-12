-- Plan metadata registry (merchant-DECLARED display copy for plan cards).
-- Must match backend/src/db/schema.ts (planMetadata) exactly — plan PDA PK,
-- owning merchant, optional title/description/category/handle.
-- Rows exist only through POST /api/plans/meta, which verifies the merchant's
-- ed25519 signature AND that the on-chain plan account is owned by the
-- signing merchant; every field is a merchant statement, never fabricated
-- server-side. `category` is one of the fixed PlanCategory values
-- ("saas" | "rpc" | "ai" | "community" | "devtools") or NULL.
CREATE TABLE IF NOT EXISTS plan_metadata (
  plan TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  title TEXT,
  description TEXT,
  category TEXT,
  handle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Merchant rollup support (GET /api/plans/meta?merchant= filters by owner).
CREATE INDEX IF NOT EXISTS plan_metadata_merchant_idx ON plan_metadata (merchant);
