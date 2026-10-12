// 単語データの読み書き。保存先は D1
import type { Example, Word } from "../shared/types.ts";

const MAX_WORD_LENGTH = 100;
const MAX_SENTENCE_LENGTH = 500;
const MAX_NOTE_LENGTH = 1000;
const MAX_EXAMPLES = 10;

type Row = { word: string; en: string | null; ja: string | null; note: string | null };

const SELECT_ROWS = `
  SELECT w.word, e.en, e.ja, e.note
  FROM words w LEFT JOIN examples e ON e.word_id = w.id`;

// 単語ごとに例文をまとめる。行は単語・例文の順に並んでいる前提
function toWords(rows: Row[]): Word[] {
  const words: Word[] = [];
  for (const { word, en, ja, note } of rows) {
    let current = words.at(-1);
    if (current?.word !== word) {
      current = { word, examples: [] };
      words.push(current);
    }
    if (en !== null && ja !== null) {
      current.examples.push(note ? { en, ja, note } : { en, ja });
    }
  }
  return words;
}

export async function listWords(db: D1Database): Promise<Word[]> {
  const { results } = await db
    .prepare(`${SELECT_ROWS} ORDER BY w.id, e.position`)
    .all<Row>();
  return toWords(results);
}

export async function findWord(db: D1Database, word: string): Promise<Word | null> {
  const { results } = await db
    .prepare(`${SELECT_ROWS} WHERE w.word = ? ORDER BY e.position`)
    .bind(word)
    .all<Row>();
  return toWords(results)[0] ?? null;
}

export type WordResult =
  | { ok: true; word: Word }
  | { ok: false; errors: string[] };

const textOf = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

// 登録・編集の入力を検証し、前後の空白を除いた単語データにする。
// existing は同じ名前を使えない他の単語
export function validateWord(
  input: unknown,
  existing: { word: string }[],
): WordResult {
  const errors: string[] = [];
  const raw = (input ?? {}) as { word?: unknown; examples?: unknown };

  const word = textOf(raw.word);
  if (!word) {
    errors.push("単語を入力してください。");
  } else if (word.length > MAX_WORD_LENGTH) {
    errors.push(`単語は${MAX_WORD_LENGTH}文字以内で入力してください。`);
  } else if (existing.some((w) => w.word === word)) {
    errors.push(`「${word}」はすでに登録されています。`);
  }

  const rawExamples = Array.isArray(raw.examples) ? raw.examples : [];
  if (rawExamples.length === 0) {
    errors.push("例文を1つ以上入力してください。");
  } else if (rawExamples.length > MAX_EXAMPLES) {
    errors.push(`例文は${MAX_EXAMPLES}個までです。`);
  }

  const examples: Example[] = rawExamples.map((item, i) => {
    const label = `例文${i + 1}`;
    const { en, ja, note } = (item ?? {}) as Record<string, unknown>;
    const example: Example = { en: textOf(en), ja: textOf(ja) };
    if (!example.en) errors.push(`${label}の英文を入力してください。`);
    if (!example.ja) errors.push(`${label}の日本語訳を入力してください。`);
    if (example.en.length > MAX_SENTENCE_LENGTH || example.ja.length > MAX_SENTENCE_LENGTH) {
      errors.push(`${label}の英文と日本語訳は${MAX_SENTENCE_LENGTH}文字以内で入力してください。`);
    }
    const noteText = textOf(note);
    if (noteText.length > MAX_NOTE_LENGTH) {
      errors.push(`${label}の解説は${MAX_NOTE_LENGTH}文字以内で入力してください。`);
    }
    if (noteText) example.note = noteText;
    return example;
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, word: { word, examples } };
}

const duplicated = (word: string): WordResult => ({
  ok: false,
  errors: [`「${word}」はすでに登録されています。`],
});

// 例文を入れる文。同じまとまりの中で先に単語を書き込んでおくこと
function insertExamples(db: D1Database, { word, examples }: Word): D1PreparedStatement[] {
  return examples.map((e, position) =>
    db
      .prepare(
        `INSERT INTO examples (word_id, position, en, ja, note)
         VALUES ((SELECT id FROM words WHERE word = ?), ?, ?, ?, ?)`,
      )
      .bind(word, position, e.en, e.ja, e.note ?? null),
  );
}

// 検証して登録する。単語と例文はまとめて書き込み、途中で失敗したら全体を取り消す
export async function addWord(db: D1Database, input: unknown): Promise<WordResult> {
  const candidate = textOf((input as { word?: unknown } | null)?.word);
  const existing = await db
    .prepare("SELECT word FROM words WHERE word = ?")
    .bind(candidate)
    .all<{ word: string }>();
  const validated = validateWord(input, existing.results);
  if (!validated.ok) return validated;

  const { word } = validated.word;
  try {
    await db.batch([
      db.prepare("INSERT INTO words (word) VALUES (?)").bind(word),
      ...insertExamples(db, validated.word),
    ]);
  } catch (e) {
    // 検証の直後に同じ単語が登録された場合
    if (String(e).includes("UNIQUE")) return duplicated(word);
    throw e;
  }
  return validated;
}

// 検証して、original の単語を入力の内容に置き換える。単語が無ければ null。
// 例文は入れ直す。途中で失敗したら全体を取り消す
export async function updateWord(
  db: D1Database,
  original: string,
  input: unknown,
): Promise<WordResult | null> {
  const target = await db
    .prepare("SELECT id FROM words WHERE word = ?")
    .bind(original)
    .first<{ id: number }>();
  if (!target) return null;

  const candidate = textOf((input as { word?: unknown } | null)?.word);
  const others = await db
    .prepare("SELECT word FROM words WHERE word = ? AND id != ?")
    .bind(candidate, target.id)
    .all<{ word: string }>();
  const validated = validateWord(input, others.results);
  if (!validated.ok) return validated;

  const { word } = validated.word;
  try {
    await db.batch([
      db.prepare("UPDATE words SET word = ? WHERE id = ?").bind(word, target.id),
      db.prepare("DELETE FROM examples WHERE word_id = ?").bind(target.id),
      ...insertExamples(db, validated.word),
    ]);
  } catch (e) {
    // 検証の直後に同じ名前の単語が登録された場合
    if (String(e).includes("UNIQUE")) return duplicated(word);
    throw e;
  }
  return validated;
}
