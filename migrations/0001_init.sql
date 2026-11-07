CREATE TABLE IF NOT EXISTS players (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 1000 CHECK (balance >= 0),
  daily_at INTEGER NOT NULL DEFAULT 0,
  game_json TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  pushes INTEGER NOT NULL DEFAULT 0,
  blackjacks INTEGER NOT NULL DEFAULT 0,
  total_wagered INTEGER NOT NULL DEFAULT 0,
  net_profit INTEGER NOT NULL DEFAULT 0,
  last_reason TEXT NOT NULL DEFAULT 'initial',
  PRIMARY KEY (guild_id, user_id)
);
CREATE INDEX IF NOT EXISTS players_rank ON players(guild_id, net_profit DESC, wins DESC);
CREATE TABLE IF NOT EXISTS chip_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_player ON chip_ledger(guild_id, user_id, id DESC);
CREATE TRIGGER IF NOT EXISTS ledger_initial AFTER INSERT ON players
BEGIN
  INSERT INTO chip_ledger (guild_id, user_id, delta, balance_after, reason)
  VALUES (NEW.guild_id, NEW.user_id, NEW.balance, NEW.balance, 'initial');
END;
CREATE TRIGGER IF NOT EXISTS ledger_balance AFTER UPDATE OF balance ON players
WHEN NEW.balance != OLD.balance
BEGIN
  INSERT INTO chip_ledger (guild_id, user_id, delta, balance_after, reason)
  VALUES (NEW.guild_id, NEW.user_id, NEW.balance - OLD.balance, NEW.balance, NEW.last_reason);
END;
