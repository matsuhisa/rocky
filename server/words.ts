// 単語データの読み書き。保存先は D1
import type { Example, Word } from "../shared/types.ts";

const MAX_WORD_LENGTH = 100;
const MAX_SENTENCE_LENGTH = 500;
const MAX_NOTE_LENGTH = 1000;
const MAX_EXAMPLES = 10;

const MAX_MEANING_LENGTH = 200;
const MAX_MEANINGS = 10;

type WordRow = { id: number; word: string };
type MeaningRow = { word_id: number; ja: string };
type ExampleRow = { word_id: number; en: string; ja: string; note: string | null };

// 単語と、その意味・例文をまとめて読む。word を渡すとその単語だけ
async function loadWords(db: D1Database, word?: string): Promise<Word[]> {
  const filter = word === undefined ? "" : "WHERE w.word = ?";
  const query = (sql: string) => {
    const statement = db.prepare(sql);
    return word === undefined ? statement : statement.bind(word);
  };
  const [wordRows, meaningRows, exampleRows] = await db.batch([
    query(`SELECT w.id, w.word FROM words w ${filter} ORDER BY w.id`),
    query(
      `SELECT m.word_id, m.ja FROM meanings m JOIN words w ON w.id = m.word_id
       ${filter} ORDER BY m.word_id, m.position`,
    ),
    query(
      `SELECT e.word_id, e.en, e.ja, e.note FROM examples e JOIN words w ON w.id = e.word_id
       ${filter} ORDER BY e.word_id, e.position`,
    ),
  ]);

  const words = new Map<number, Word>();
  for (const { id, word } of wordRows.results as WordRow[]) {
    words.set(id, { word, meanings: [], examples: [] });
  }
  for (const { word_id, ja } of meaningRows.results as MeaningRow[]) {
    words.get(word_id)?.meanings.push(ja);
  }
  for (const { word_id, en, ja, note } of exampleRows.results as ExampleRow[]) {
    words.get(word_id)?.examples.push(note ? { en, ja, note } : { en, ja });
  }
  return [...words.values()];
}

export function listWords(db: D1Database): Promise<Word[]> {
  return loadWords(db);
}

export async function findWord(db: D1Database, word: string): Promise<Word | null> {
  return (await loadWords(db, word))[0] ?? null;
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
  const raw = (input ?? {}) as { word?: unknown; meanings?: unknown; examples?: unknown };

  const word = textOf(raw.word);
  if (!word) {
    errors.push("単語を入力してください。");
  } else if (word.length > MAX_WORD_LENGTH) {
    errors.push(`単語は${MAX_WORD_LENGTH}文字以内で入力してください。`);
  } else if (existing.some((w) => w.word === word)) {
    errors.push(`「${word}」はすでに登録されています。`);
  }

  const meanings = (Array.isArray(raw.meanings) ? raw.meanings : []).map(textOf);
  if (meanings.length === 0) {
    errors.push("意味を1つ以上入力してください。");
  } else if (meanings.length > MAX_MEANINGS) {
    errors.push(`意味は${MAX_MEANINGS}個までです。`);
  }
  meanings.forEach((meaning, i) => {
    if (!meaning) {
      errors.push(`意味${i + 1}を入力してください。`);
    } else if (meaning.length > MAX_MEANING_LENGTH) {
      errors.push(`意味${i + 1}は${MAX_MEANING_LENGTH}文字以内で入力してください。`);
    }
  });

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

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, word: { word, meanings, examples } };
}

const duplicated = (word: string): WordResult => ({
  ok: false,
  errors: [`「${word}」はすでに登録されています。`],
});

// 意味と例文を入れる文。同じまとまりの中で先に単語を書き込んでおくこと
function insertDetails(
  db: D1Database,
  { word, meanings, examples }: Word,
): D1PreparedStatement[] {
  const wordId = "(SELECT id FROM words WHERE word = ?)";
  return [
    ...meanings.map((ja, position) =>
      db
        .prepare(`INSERT INTO meanings (word_id, position, ja) VALUES (${wordId}, ?, ?)`)
        .bind(word, position, ja),
    ),
    ...examples.map((e, position) =>
      db
        .prepare(
          `INSERT INTO examples (word_id, position, en, ja, note)
           VALUES (${wordId}, ?, ?, ?, ?)`,
        )
        .bind(word, position, e.en, e.ja, e.note ?? null),
    ),
  ];
}

// 検証して登録する。単語・意味・例文はまとめて書き込み、途中で失敗したら全体を取り消す
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
      ...insertDetails(db, validated.word),
    ]);
  } catch (e) {
    // 検証の直後に同じ単語が登録された場合
    if (String(e).includes("UNIQUE")) return duplicated(word);
    throw e;
  }
  return validated;
}

// 検証して、original の単語を入力の内容に置き換える。単語が無ければ null。
// 意味と例文は入れ直す。途中で失敗したら全体を取り消す
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
      db.prepare("DELETE FROM meanings WHERE word_id = ?").bind(target.id),
      db.prepare("DELETE FROM examples WHERE word_id = ?").bind(target.id),
      ...insertDetails(db, validated.word),
    ]);
  } catch (e) {
    // 検証の直後に同じ名前の単語が登録された場合
    if (String(e).includes("UNIQUE")) return duplicated(word);
    throw e;
  }
  return validated;
}
