-- Registro automático dos slash commands pela Cloudflare
CREATE TABLE IF NOT EXISTS bot_setup (
  key TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  http_code INTEGER,
  command_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
