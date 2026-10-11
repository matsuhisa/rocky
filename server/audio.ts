// 読み上げ音声のキャッシュ。同じテキストは一度だけ生成し、以降は R2 に保存した音声を使い回す
import type { Env } from "./env.ts";
import { synthesize, voiceIdOf, type Lang } from "./tts.ts";

async function keyFor(env: Env, text: string, lang: Lang): Promise<string> {
  const data = new TextEncoder().encode(`${voiceIdOf(env)}\n${lang}\n${text}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", data));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex}.wav`;
}

async function generate(env: Env, key: string, text: string, lang: Lang): Promise<Uint8Array> {
  const wav = await synthesize(env, text, lang);
  await env.AUDIO.put(key, wav, { httpMetadata: { contentType: "audio/wav" } });
  return wav;
}

// 音声 (WAV) を返す。無ければ生成して保存する
export async function audioFor(
  env: Env,
  text: string,
  lang: Lang,
): Promise<ReadableStream | Uint8Array> {
  const key = await keyFor(env, text, lang);
  return (await env.AUDIO.get(key))?.body ?? generate(env, key, text, lang);
}

// 音声が無ければ生成して保存する (中身は返さない)
export async function ensureAudio(env: Env, text: string, lang: Lang): Promise<void> {
  const key = await keyFor(env, text, lang);
  if (!(await env.AUDIO.head(key))) await generate(env, key, text, lang);
}
