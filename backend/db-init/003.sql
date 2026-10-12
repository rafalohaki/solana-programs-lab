-- Aggregation support for merchant charge rollups
-- (GET /api/invoices/charges?merchant= JOINs invoice_charges to
-- invoice_metadata). Must match backend/src/db/schema.ts index definitions.
CREATE INDEX IF NOT EXISTS invoice_charges_invoice_idx ON invoice_charges (invoice);
CREATE INDEX IF NOT EXISTS invoice_metadata_merchant_idx ON invoice_metadata (merchant);
