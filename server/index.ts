import { readFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { SequenceField } from "../shared/types.ts";
import { audioPathFor } from "./audio.ts";
import type { Lang } from "./tts.ts";
import { addWord, loadWordData } from "./words.ts";

// 読み上げ項目ごとの言語
const LANG_OF: Record<SequenceField, Lang> = { word: "en", en: "en", ja: "ja" };

const app = new Hono();

app.get("/api/words", async (c) => {
  const { words } = await loadWordData();
  return c.json({ words });
});

app.post("/api/words", async (c) => {
  const result = await addWord(await c.req.json().catch(() => null));
  if (!result.ok) return c.json({ error: result.errors.join(" "), errors: result.errors }, 400);

  // 登録時に音声をまとめて生成しておく。失敗しても登録は取り消さず、再生時に作り直す
  const { word } = result;
  const texts: [string, Lang][] = [
    [word.word, "en"],
    ...word.examples.flatMap((e): [string, Lang][] => [
      [e.en, "en"],
      [e.ja, "ja"],
    ]),
  ];
  let audioReady = true;
  try {
    await Promise.all(texts.map(([text, lang]) => audioPathFor(text, lang)));
  } catch (e) {
    console.error(e);
    audioReady = false;
  }
  return c.json({ word, audioReady }, 201);
});

app.get("/api/words/:word", async (c) => {
  const { sequence, words } = await loadWordData();
  const word = words.find((w) => w.word === c.req.param("word"));
  if (!word) return c.json({ error: "単語が見つかりません" }, 404);
  return c.json({ word, sequence });
});

// 登録済みの単語・例文の音声だけを返す (任意のテキストは読み上げない)
// field=word | field=en&example=0 | field=ja&example=0
app.get("/api/words/:word/audio", async (c) => {
  const { words } = await loadWordData();
  const word = words.find((w) => w.word === c.req.param("word"));
  if (!word) return c.json({ error: "単語が見つかりません" }, 404);

  const field = c.req.query("field") ?? "";
  if (!(field in LANG_OF)) {
    return c.json({ error: "field は word / en / ja のいずれかです" }, 400);
  }
  const key = field as SequenceField;
  const text =
    key === "word" ? word.word : word.examples[Number(c.req.query("example"))]?.[key];
  if (!text) return c.json({ error: "例文が見つかりません" }, 404);

  try {
    const wav = await readFile(await audioPathFor(text, LANG_OF[key]));
    return c.body(wav, 200, { "Content-Type": "audio/wav", "Cache-Control": "no-cache" });
  } catch (e) {
    console.error(e);
    return c.json({ error: "音声を生成できませんでした" }, 502);
  }
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`API サーバー: http://localhost:${port}`);
});
