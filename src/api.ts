import type { Word } from "../shared/types.ts";

export async function fetchWords(): Promise<Word[]> {
  const res = await fetch("/api/words");
  if (!res.ok) throw new Error(`単語の取得に失敗しました (${res.status})`);
  const { words } = (await res.json()) as { words: Word[] };
  return words;
}
