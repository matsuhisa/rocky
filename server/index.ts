import { Hono } from "hono";
import { SEQUENCE } from "../shared/sequence.ts";
import type { SequenceField, Word } from "../shared/types.ts";
import { requireAccess } from "./access.ts";
import { audioFor, ensureAudio } from "./audio.ts";
import type { Env } from "./env.ts";
import type { Lang } from "./tts.ts";
import { addWord, findWord, listWords, updateWord } from "./words.ts";

// 読み上げ項目ごとの言語
const LANG_OF: Record<SequenceField, Lang> = { word: "en", meaning: "ja", en: "en", ja: "ja" };

const app = new Hono<{ Bindings: Env }>();

app.onError((e, c) => {
  console.error(e);
  return c.json({ error: "サーバーでエラーが起きました" }, 500);
});

app.use("/api/*", requireAccess);

app.get("/api/words", async (c) => {
  return c.json({ words: await listWords(c.env.DB) });
});

// 単語・意味・例文の音声をまとめて生成しておく。失敗したら false (再生時に作り直される)
async function prepareAudio(env: Env, word: Word): Promise<boolean> {
  const texts = new Map<string, Lang>([[word.word, "en"]]);
  for (const meaning of word.meanings) texts.set(meaning, "ja");
  for (const e of word.examples) {
    texts.set(e.en, "en");
    texts.set(e.ja, "ja");
  }
  try {
    await Promise.all([...texts].map(([text, lang]) => ensureAudio(env, text, lang)));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

app.post("/api/words", async (c) => {
  const result = await addWord(c.env.DB, await c.req.json().catch(() => null));
  if (!result.ok) return c.json({ error: result.errors.join(" "), errors: result.errors }, 400);
  // 音声の生成に失敗しても登録は取り消さない
  return c.json({ word: result.word, audioReady: await prepareAudio(c.env, result.word) }, 201);
});

app.put("/api/words/:word", async (c) => {
  const input = await c.req.json().catch(() => null);
  const result = await updateWord(c.env.DB, c.req.param("word"), input);
  if (!result) return c.json({ error: "単語が見つかりません", errors: ["単語が見つかりません。"] }, 404);
  if (!result.ok) return c.json({ error: result.errors.join(" "), errors: result.errors }, 400);
  // 文面が変わったものだけ新しく生成される
  return c.json({ word: result.word, audioReady: await prepareAudio(c.env, result.word) });
});

app.get("/api/words/:word", async (c) => {
  const word = await findWord(c.env.DB, c.req.param("word"));
  if (!word) return c.json({ error: "単語が見つかりません" }, 404);
  return c.json({ word, sequence: SEQUENCE });
});

// 登録済みの単語・例文の音声だけを返す (任意のテキストは読み上げない)
// field=word | field=meaning&index=0 | field=en&index=0 | field=ja&index=0
// (index は意味または例文の何番目か)
app.get("/api/words/:word/audio", async (c) => {
  const word = await findWord(c.env.DB, c.req.param("word"));
  if (!word) return c.json({ error: "単語が見つかりません" }, 404);

  const field = c.req.query("field") ?? "";
  if (!(field in LANG_OF)) {
    return c.json({ error: "field は word / meaning / en / ja のいずれかです" }, 400);
  }
  const key = field as SequenceField;
  const index = Number(c.req.query("index"));
  const text =
    key === "word"
      ? word.word
      : key === "meaning"
        ? word.meanings[index]
        : word.examples[index]?.[key];
  if (!text) return c.json({ error: "意味または例文が見つかりません" }, 404);

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
