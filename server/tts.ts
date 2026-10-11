// Gemini API の TTS でテキストを WAV に変換する
import type { Env } from "./env.ts";

export type Lang = "en" | "ja";

// 短い単語だけだと読み上げ対象と解釈されないことがあるので、指示を明示する
const INSTRUCTIONS: Record<Lang, string> = {
  en: "Say clearly: ",
  ja: "次の日本語をはっきり読み上げてください: ",
};

// リクエストの中で待つので、やり直しは少なめにする
const MAX_RETRIES = 2;

const modelOf = (env: Env) => env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
const voiceOf = (env: Env) => env.GEMINI_TTS_VOICE ?? "Kore";

// 同じ音声になる条件 (キャッシュのキーに使う)
export const voiceIdOf = (env: Env) => `${modelOf(env)}/${voiceOf(env)}`;

// レスポンスの mimeType (例: audio/L16;codec=pcm;rate=24000) からサンプルレートを取る
function sampleRateOf(mimeType: string | undefined): number {
  const m = /rate=(\d+)/.exec(mimeType ?? "");
  return m ? Number(m[1]) : 24000;
}

// 生 PCM (16bit / モノラル) に WAV ヘッダを付ける
function pcmToWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const wav = new Uint8Array(44 + pcm.length);
  const header = new DataView(wav.buffer);
  const ascii = (offset: number, text: string) =>
    [...text].forEach((ch, i) => header.setUint8(offset + i, ch.charCodeAt(0)));
  ascii(0, "RIFF");
  header.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // モノラル
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  ascii(36, "data");
  header.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

// 429 のレスポンスから、待てば直るか (1日の上限なら待っても無駄) と待ち時間を読み取る
function rateLimitOf(body: string): { daily: boolean; waitMs: number | null } {
  let details: { violations?: { quotaId?: string }[]; retryDelay?: string }[] = [];
  try {
    details = JSON.parse(body).error?.details ?? [];
  } catch {}
  const quotaIds = details
    .flatMap((d) => d.violations ?? [])
    .map((v) => v.quotaId ?? "");
  const retryDelay = details.find((d) => d.retryDelay)?.retryDelay;
  return {
    daily: quotaIds.some((id) => id.includes("PerDay")),
    waitMs: retryDelay ? Math.ceil(parseFloat(retryDelay) * 1000) + 1000 : null,
  };
}

export async function synthesize(env: Env, text: string, lang: Lang): Promise<Uint8Array> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelOf(env)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: INSTRUCTIONS[lang] + text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceOf(env) } },
            },
          },
        }),
      },
    );
    const body = await res.text();
    const canRetry = attempt < MAX_RETRIES;

    if (res.status === 429) {
      const { daily, waitMs } = rateLimitOf(body);
      if (daily) {
        throw new Error(`Gemini API の1日あたりの上限に達しました: ${body}`);
      }
      if (canRetry) {
        // 1分あたりの上限。API が指定した時間 (無ければ 20秒) 待ってやり直す
        await new Promise((resolve) => setTimeout(resolve, waitMs ?? 20000));
        continue;
      }
    }
    if (!res.ok) {
      throw new Error(`Gemini API エラー ${res.status}: ${body}`);
    }

    const parts: { inlineData?: { data: string; mimeType?: string } }[] =
      JSON.parse(body).candidates?.[0]?.content?.parts ?? [];
    const inline = parts.find((p) => p.inlineData)?.inlineData;
    if (inline) {
      const pcm = Uint8Array.from(atob(inline.data), (ch) => ch.charCodeAt(0));
      return pcmToWav(pcm, sampleRateOf(inline.mimeType));
    }
    // 200 でも音声が入っていない応答がまれにあるので、やり直す
    if (!canRetry) {
      throw new Error(`音声が返ってきませんでした: ${body}`);
    }
  }
}
