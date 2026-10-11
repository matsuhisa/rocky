CREATE TABLE words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- position は単語内での例文の並び順 (0 始まり)
CREATE TABLE examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL REFERENCES words (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  en TEXT NOT NULL,
  ja TEXT NOT NULL,
  note TEXT,
  UNIQUE (word_id, position)
);
