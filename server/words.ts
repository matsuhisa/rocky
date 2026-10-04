// 単語データの読み書き。保存先を変えるときはこのファイルだけ差し替える
import { readFile } from "node:fs/promises";
import type { WordData } from "../shared/types.ts";

const DATA_PATH = new URL("../data/words.json", import.meta.url);

export async function loadWordData(): Promise<WordData> {
  return JSON.parse(await readFile(DATA_PATH, "utf8"));
}
