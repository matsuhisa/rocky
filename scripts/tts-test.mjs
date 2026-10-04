// Gemini API の TTS で英単語・英文を読み上げるテスト
// 使い方: node --env-file=.env scripts/tts-test.mjs [単語] [英文]
import { writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { synthesize } from "../server/tts.ts";

const OUT_DIR = "out";

const word = process.argv[2] ?? "resilient";
const sentence =
  process.argv[3] ?? "She remained resilient despite all the setbacks.";

await mkdir(OUT_DIR, { recursive: true });
for (const [name, text] of [
  ["word", word],
  ["sentence", sentence],
]) {
  const started = Date.now();
  const wav = await synthesize(text);
  const path = `${OUT_DIR}/${name}.wav`;
  await writeFile(path, wav);
  console.log(`${path} (${Date.now() - started}ms): ${text}`);
  if (process.platform === "darwin") {
    await promisify(execFile)("afplay", [path]);
  }
}
