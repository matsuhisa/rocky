-- 単語の意味 (日本語)。品詞ごとなどで複数持てる。position は単語内での並び順 (0 始まり)
CREATE TABLE meanings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL REFERENCES words (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  ja TEXT NOT NULL,
  UNIQUE (word_id, position)
);
