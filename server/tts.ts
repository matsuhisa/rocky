// Gemini API の TTS でテキストを WAV に変換する
const MODEL = process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
const VOICE = process.env.GEMINI_TTS_VOICE ?? "Kore";

export type Lang = "en" | "ja";

// 短い単語だけだと読み上げ対象と解釈されないことがあるので、指示を明示する
const INSTRUCTIONS: Record<Lang, string> = {
  en: "Say clearly: ",
  ja: "次の日本語をはっきり読み上げてください: ",
};

// 同じ音声になる条件 (キャッシュのキーに使う)
export const voiceId = `${MODEL}/${VOICE}`;

const MAX_RETRIES = 5;

// レスポンスの mimeType (例: audio/L16;codec=pcm;rate=24000) からサンプルレートを取る
function sampleRateOf(mimeType: string | undefined): number {
  const m = /rate=(\d+)/.exec(mimeType ?? "");
  return m ? Number(m[1]) : 24000;
}

// 生 PCM (16bit / モノラル) に WAV ヘッダを付ける
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
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

export async function synthesize(text: string, lang: Lang = "en"): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません (.env に書いてください)");
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: INSTRUCTIONS[lang] + text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
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
        throw new Error(
          `Gemini API の1日あたりの上限に達しました。明日以降に再実行するか、課金を有効にしてください: ${body}`,
        );
      }
      if (canRetry) {
        // 1分あたりの上限。API が指定した時間 (無ければ 30秒〜) 待ってやり直す
        const ms = waitMs ?? 30000 * (attempt + 1);
        console.error(`  (レート制限のため ${Math.round(ms / 1000)} 秒待ちます)`);
        await new Promise((resolve) => setTimeout(resolve, ms));
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
      return pcmToWav(
        Buffer.from(inline.data, "base64"),
        sampleRateOf(inline.mimeType),
      );
    }
    // 200 でも音声が入っていない応答がまれにあるので、やり直す
    if (!canRetry) {
      throw new Error(`音声が返ってきませんでした: ${body}`);
    }
  }
}
