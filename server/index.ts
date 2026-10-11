import { Hono } from "hono";
import { SEQUENCE } from "../shared/sequence.ts";
import type { SequenceField } from "../shared/types.ts";
import { audioFor, ensureAudio } from "./audio.ts";
import type { Env } from "./env.ts";
import type { Lang } from "./tts.ts";
import { addWord, findWord, listWords } from "./words.ts";

// 読み上げ項目ごとの言語
const LANG_OF: Record<SequenceField, Lang> = { word: "en", en: "en", ja: "ja" };

const app = new Hono<{ Bindings: Env }>();

app.onError((e, c) => {
  console.error(e);
  return c.json({ error: "サーバーでエラーが起きました" }, 500);
});

app.get("/api/words", async (c) => {
  return c.json({ words: await listWords(c.env.DB) });
});

app.post("/api/words", async (c) => {
  const result = await addWord(c.env.DB, await c.req.json().catch(() => null));
  if (!result.ok) return c.json({ error: result.errors.join(" "), errors: result.errors }, 400);

  // 登録時に音声をまとめて生成しておく。失敗しても登録は取り消さず、再生時に作り直す
  const { word } = result;
  const texts = new Map<string, Lang>([[word.word, "en"]]);
  for (const e of word.examples) {
    texts.set(e.en, "en");
    texts.set(e.ja, "ja");
  }
  let audioReady = true;
  try {
    await Promise.all([...texts].map(([text, lang]) => ensureAudio(c.env, text, lang)));
  } catch (e) {
    console.error(e);
    audioReady = false;
  }
  return c.json({ word, audioReady }, 201);
});

app.get("/api/words/:word", async (c) => {
  const word = await findWord(c.env.DB, c.req.param("word"));
  if (!word) return c.json({ error: "単語が見つかりません" }, 404);
  return c.json({ word, sequence: SEQUENCE });
});

// 登録済みの単語・例文の音声だけを返す (任意のテキストは読み上げない)
// field=word | field=en&example=0 | field=ja&example=0
app.get("/api/words/:word/audio", async (c) => {
  const word = await findWord(c.env.DB, c.req.param("word"));
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
    const wav = await audioFor(c.env, text, LANG_OF[key]);
    return new Response(wav, {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error(e);
    return c.json({ error: "音声を生成できませんでした" }, 502);
  }
});

app.all("/api/*", (c) => c.json({ error: "見つかりません" }, 404));

export default app;
