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
