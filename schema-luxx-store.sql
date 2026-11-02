-- Execute este SQL uma única vez no D1 chamado editor-site.
CREATE TABLE IF NOT EXISTS store_state (
  id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
