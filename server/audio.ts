// 読み上げ音声のキャッシュ。同じテキストは一度だけ生成し、以降は保存した音声を使い回す
import { access, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { synthesize, voiceId, type Lang } from "./tts.ts";

const CACHE_DIR = fileURLToPath(new URL("../out/cache/", import.meta.url));

// 生成中のものを覚えておき、同じテキストの要求が重なっても API を1回しか呼ばない
const inFlight = new Map<string, Promise<string>>();

async function generate(path: string, text: string, lang: Lang): Promise<string> {
  try {
    await access(path);
  } catch {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(path, await synthesize(text, lang));
  }
  return path;
}

// 音声ファイルのパスを返す。無ければ生成する
export function audioPathFor(text: string, lang: Lang): Promise<string> {
  const hash = createHash("sha1").update(`${voiceId}\n${lang}\n${text}`).digest("hex");
  const path = `${CACHE_DIR}${hash}.wav`;
  let pending = inFlight.get(path);
  if (!pending) {
    pending = generate(path, text, lang).finally(() => inFlight.delete(path));
    inFlight.set(path, pending);
  }
  return pending;
}
