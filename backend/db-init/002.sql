-- Widget domain bindings. Must match backend/src/db/schema.ts (widgetSites).
CREATE TABLE IF NOT EXISTS widget_sites (
  merchant TEXT NOT NULL,
  domain TEXT NOT NULL,
  plan TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant, domain)
);
