import type { SequenceField, Word } from "../shared/types.ts";

async function getJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: null }));
    throw new Error(error ?? `${what}の取得に失敗しました (${res.status})`);
  }
  return res.json();
}

export async function fetchWords(): Promise<Word[]> {
  const { words } = await getJson<{ words: Word[] }>("/api/words", "単語");
  return words;
}

export function fetchWord(
  word: string,
): Promise<{ word: Word; sequence: SequenceField[] }> {
  return getJson(`/api/words/${encodeURIComponent(word)}`, "単語");
}

// 単語そのもの、または example 番目の例文の音声の URL
export function audioUrl(word: string, field: SequenceField, example = 0): string {
  const query = new URLSearchParams({ field, example: String(example) });
  return `/api/words/${encodeURIComponent(word)}/audio?${query}`;
}

// 入力の誤りなど、画面にそのまま出せるメッセージを持つエラー
export class ApiError extends Error {
  errors: string[];
  constructor(errors: string[]) {
    super(errors.join(" "));
    this.errors = errors;
  }
}

type Saved = { word: Word; audioReady: boolean };

async function saveWord(method: string, url: string, input: Word, what: string): Promise<Saved> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const { errors } = await res.json().catch(() => ({ errors: null }));
    throw new ApiError(errors ?? [`${what}に失敗しました (${res.status})`]);
  }
  return res.json();
}

// 単語を登録する。音声の生成まで終わってから返るので、数秒かかる
export function createWord(input: Word): Promise<Saved> {
  return saveWord("POST", "/api/words", input, "登録");
}

// original の単語を input の内容に置き換える。文面が変わった分の音声を生成してから返る
export function updateWord(original: string, input: Word): Promise<Saved> {
  return saveWord("PUT", `/api/words/${encodeURIComponent(original)}`, input, "保存");
}
