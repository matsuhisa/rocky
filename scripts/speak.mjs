// data/words.json の単語と例文を、sequence の順番で読み上げる
// 使い方: node --env-file=.env scripts/speak.mjs [単語...] [--no-play]
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { audioPathFor } from "../server/audio.ts";

const DATA_PATH = "data/words.json";

// sequence に書ける項目と、その読み上げ言語
const FIELDS = { word: "en", en: "en", ja: "ja" };

const args = process.argv.slice(2);
const play = !args.includes("--no-play") && process.platform === "darwin";
const targets = args.filter((a) => !a.startsWith("--"));

const { sequence, words } = JSON.parse(await readFile(DATA_PATH, "utf8"));

const unknownField = sequence.find((f) => !(f in FIELDS));
if (unknownField) {
  console.error(
    `sequence に使えない項目です: ${unknownField} (使えるのは ${Object.keys(FIELDS).join(", ")})`,
  );
  process.exit(1);
}

const missing = targets.filter((t) => !words.some((w) => w.word === t));
if (missing.length > 0) {
  console.error(`${DATA_PATH} に無い単語です: ${missing.join(", ")}`);
  process.exit(1);
}
const selected =
  targets.length > 0 ? words.filter((w) => targets.includes(w.word)) : words;

for (const { word, examples } of selected) {
  for (const example of examples) {
    const texts = { word, en: example.en, ja: example.ja };
    console.log(`\n■ ${word}`);
    if (example.note) console.log(`  (解説) ${example.note}`);
    for (const field of sequence) {
      const path = await audioPathFor(texts[field], FIELDS[field]);
      console.log(`  ${field.padEnd(4)} ${texts[field]}`);
      if (play) await promisify(execFile)("afplay", [path]);
    }
  }
}
