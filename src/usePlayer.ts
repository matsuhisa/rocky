import { useCallback, useEffect, useRef, useState } from "react";

// いま再生中のもの。id は再生を始めたボタン、index は urls の何番目か。
// loading は音声の読み込み (初回は生成) を待っている間 true
export type Playing = { id: string; index: number; loading: boolean };

export const PLAYBACK_RATES = [0.8, 0.9, 1, 1.1, 1.2, 1.5];
export const REWIND_SECONDS = 3;

// 各音声の前に置く無音。出力機器が鳴り始める前に冒頭が欠けるのを防ぎ、
// 順番に再生するときの区切りにもなる
const LEAD_SECONDS = 0.4;

const RATE_STORAGE_KEY = "rocky.playbackRate";

type Clip = { sampleRate: number; samples: Int16Array };

// サーバーが返す WAV (44 バイトのヘッダ + 16bit モノラル) から音声の中身を取り出す
async function fetchClip(url: string): Promise<Clip> {
  const res = await fetch(url);
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: null }));
    throw new Error(error ?? `音声を取得できませんでした (${res.status})`);
  }
  const data = await res.arrayBuffer();
  const body = data.slice(44, data.byteLength - (data.byteLength % 2));
  return {
    sampleRate: new DataView(data).getUint32(24, true),
    samples: new Int16Array(body),
  };
}

function wavUrl(samples: Int16Array, sampleRate: number): string {
  const header = new DataView(new ArrayBuffer(44));
  const ascii = (offset: number, text: string) =>
    [...text].forEach((ch, i) => header.setUint8(offset + i, ch.charCodeAt(0)));
  ascii(0, "RIFF");
  header.setUint32(4, 36 + samples.byteLength, true);
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
  header.setUint32(40, samples.byteLength, true);
  return URL.createObjectURL(
    new Blob([header, samples.buffer as ArrayBuffer], { type: "audio/wav" }),
  );
}

// 無音を挟みながら1本の音声につなげる。starts は各音声 (前の無音を含む) が始まる秒
function joinClips(clips: Clip[]): { url: string; starts: number[] } {
  const { sampleRate } = clips[0];
  if (clips.some((c) => c.sampleRate !== sampleRate)) {
    throw new Error("音声の形式が揃っていないため、つなげて再生できません。");
  }
  const lead = Math.round(LEAD_SECONDS * sampleRate);
  const total = clips.reduce((sum, c) => sum + lead + c.samples.length, 0);
  const track = new Int16Array(total);
  const starts: number[] = [];
  let offset = 0;
  for (const { samples } of clips) {
    starts.push(offset / sampleRate);
    track.set(samples, offset + lead);
    offset += lead + samples.length;
  }
  return { url: wavUrl(track, sampleRate), starts };
}

function loadRate(): number {
  try {
    const saved = Number(localStorage.getItem(RATE_STORAGE_KEY));
    if (PLAYBACK_RATES.includes(saved)) return saved;
  } catch {}
  return 1;
}

// 音声を順番に再生する。すべて読み込み、1本につなげてから鳴らし始める。
// 新しく再生を始めると、再生中のものは止まる
export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 読み込み済みの音声。同じ音声を二度取りに行かない
  const clipsRef = useRef(new Map<string, Promise<Clip>>());
  const trackUrlRef = useRef<string | null>(null);
  const silenceUrlRef = useRef<string | null>(null);
  // 再生のたびに増やし、古い再生の続きが割り込まないようにする
  const runRef = useRef(0);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRateState] = useState(loadRate);
  const rateRef = useRef(rate);

  // 鳴っているものを止め、前の再生のイベントが届かないようにする
  const reset = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.ontimeupdate = audio.onended = audio.onerror = null;
    audio.pause();
  }, []);

  const stop = useCallback(() => {
    runRef.current++;
    reset();
    setPlaying(null);
  }, [reset]);

  const play = useCallback(
    async (id: string, urls: string[]) => {
      const audio = (audioRef.current ??= new Audio());
      const run = ++runRef.current;
      reset();
      setError(null);
      setPlaying({ id, index: 0, loading: true });

      // 読み込みを待つ前に、クリックの処理中に無音を鳴らしておく。
      // 後からの再生がブラウザに止められないようにし、出力機器も先に起こす
      silenceUrlRef.current ??= wavUrl(new Int16Array(2400), 24000);
      audio.src = silenceUrlRef.current;
      audio.play().catch(() => {});

      const load = (url: string) => {
        let clip = clipsRef.current.get(url);
        if (!clip) {
          clip = fetchClip(url);
          // 失敗したものは覚えず、次の再生で取り直す
          clip.catch(() => clipsRef.current.delete(url));
          clipsRef.current.set(url, clip);
        }
        return clip;
      };

      try {
        const clips = await Promise.all(urls.map(load));
        if (runRef.current !== run) return;

        const { url, starts } = joinClips(clips);
        if (trackUrlRef.current) URL.revokeObjectURL(trackUrlRef.current);
        trackUrlRef.current = url;

        audio.src = url;
        // src を替えると速度が既定値に戻るので、両方に設定する
        audio.defaultPlaybackRate = audio.playbackRate = rateRef.current;
        audio.ontimeupdate = () => {
          // 巻き戻しで前の音声に戻ることもあるので、位置から毎回求める
          const index = starts.findLastIndex((start) => start <= audio.currentTime);
          setPlaying((p) => (p && p.index !== index ? { ...p, index } : p));
        };
        audio.onended = () => {
          if (runRef.current === run) setPlaying(null);
        };
        audio.onerror = () => {
          if (runRef.current !== run) return;
          setError("音声を再生できませんでした。");
          setPlaying(null);
        };
        setPlaying({ id, index: 0, loading: false });
        await audio.play();
      } catch (e) {
        if (runRef.current !== run) return;
        setError(e instanceof Error ? e.message : "音声を再生できませんでした。");
        setPlaying(null);
      }
    },
    [reset],
  );

  // 再生位置を少し戻す。音声の境目をまたいで前の音声にも戻れる
  const rewind = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.currentTime = Math.max(0, audio.currentTime - REWIND_SECONDS);
  }, []);

  // 再生中でもすぐ反映し、次回のために覚えておく
  const setRate = useCallback((next: number) => {
    rateRef.current = next;
    setRateState(next);
    const audio = audioRef.current;
    if (audio) audio.defaultPlaybackRate = audio.playbackRate = next;
    try {
      localStorage.setItem(RATE_STORAGE_KEY, String(next));
    } catch {}
  }, []);

  useEffect(
    () => () => {
      stop();
      for (const ref of [trackUrlRef, silenceUrlRef]) {
        if (ref.current) URL.revokeObjectURL(ref.current);
        ref.current = null;
      }
    },
    [stop],
  );

  return { playing, error, rate, play, stop, rewind, setRate };
}
