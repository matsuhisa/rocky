// 単語データの読み書き。保存先を変えるときはこのファイルだけ差し替える
import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Example, Word, WordData } from "../shared/types.ts";

const DATA_PATH =
  process.env.WORDS_FILE ??
  fileURLToPath(new URL("../data/words.json", import.meta.url));

const MAX_WORD_LENGTH = 100;
const MAX_SENTENCE_LENGTH = 500;
const MAX_NOTE_LENGTH = 1000;
const MAX_EXAMPLES = 10;

export async function loadWordData(): Promise<WordData> {
  return JSON.parse(await readFile(DATA_PATH, "utf8"));
}

// 書きかけのファイルが残らないよう、別名で書いてから置き換える
async function saveWordData(data: WordData): Promise<void> {
  const tmp = `${DATA_PATH}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n");
  await rename(tmp, DATA_PATH);
}

export type NewWordResult =
  | { ok: true; word: Word }
  | { ok: false; errors: string[] };

const textOf = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

// 登録の入力を検証し、前後の空白を除いた単語データにする
export function validateNewWord(input: unknown, existing: Word[]): NewWordResult {
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

// 同時に登録されても互いの書き込みを消さないよう、1件ずつ順に処理する
let queue: Promise<unknown> = Promise.resolve();

export function addWord(input: unknown): Promise<NewWordResult> {
  const result = queue.then(async () => {
    const data = await loadWordData();
    const validated = validateNewWord(input, data.words);
    if (validated.ok) {
      data.words.push(validated.word);
      await saveWordData(data);
    }
    return validated;
  });
  queue = result.catch(() => {});
  return result;
}
