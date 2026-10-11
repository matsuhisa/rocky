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

export type NewWordResult =
  | { ok: true; word: Word }
  | { ok: false; errors: string[] };

const textOf = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

// 登録の入力を検証し、前後の空白を除いた単語データにする
export function validateNewWord(
  input: unknown,
  existing: { word: string }[],
): NewWordResult {
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

// 検証して登録する。単語と例文はまとめて書き込み、途中で失敗したら全体を取り消す
export async function addWord(db: D1Database, input: unknown): Promise<NewWordResult> {
  const candidate = textOf((input as { word?: unknown } | null)?.word);
  const existing = await db
    .prepare("SELECT word FROM words WHERE word = ?")
    .bind(candidate)
    .all<{ word: string }>();
  const validated = validateNewWord(input, existing.results);
  if (!validated.ok) return validated;

  const { word, examples } = validated.word;
  try {
    await db.batch([
      db.prepare("INSERT INTO words (word) VALUES (?)").bind(word),
      ...examples.map((e, position) =>
        db
          .prepare(
            `INSERT INTO examples (word_id, position, en, ja, note)
             VALUES ((SELECT id FROM words WHERE word = ?), ?, ?, ?, ?)`,
          )
          .bind(word, position, e.en, e.ja, e.note ?? null),
      ),
    ]);
  } catch (e) {
    // 検証の直後に同じ単語が登録された場合
    if (String(e).includes("UNIQUE")) {
      return { ok: false, errors: [`「${word}」はすでに登録されています。`] };
    }
    throw e;
  }
  return validated;
}
