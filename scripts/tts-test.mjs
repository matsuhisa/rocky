// Gemini API の TTS で英単語・英文を読み上げるテスト
// 使い方: node --env-file=.env scripts/tts-test.mjs [単語] [英文]
import { writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
const VOICE = process.env.GEMINI_TTS_VOICE ?? "Kore";
const OUT_DIR = "out";

if (!API_KEY) {
  console.error("GEMINI_API_KEY が設定されていません (.env に書いてください)");
  process.exit(1);
}

const word = process.argv[2] ?? "resilient";
const sentence =
  process.argv[3] ?? "She remained resilient despite all the setbacks.";

// レスポンスの mimeType (例: audio/L16;codec=pcm;rate=24000) からサンプルレートを取る
function sampleRateOf(mimeType) {
  const m = /rate=(\d+)/.exec(mimeType ?? "");
  return m ? Number(m[1]) : 24000;
}

// 生 PCM (16bit / モノラル) に WAV ヘッダを付ける
function pcmToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // モノラル
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function synthesize(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify({
        // 短い単語だけだと読み上げ対象と解釈されないことがあるので、指示を明示する
        contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
          },
        },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini API エラー ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const inline = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
    ?.inlineData;
  if (!inline) {
    throw new Error(`音声が返ってきませんでした: ${JSON.stringify(json)}`);
  }
  return pcmToWav(
    Buffer.from(inline.data, "base64"),
    sampleRateOf(inline.mimeType),
  );
}

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
