import { useCallback, useEffect, useRef, useState } from "react";

// いま再生中のもの。id は再生を始めたボタン、index は urls の何番目か。
// loading は音声の読み込み (初回は生成) を待っている間 true
export type Playing = { id: string; index: number; loading: boolean };

// 各音声の前に置く無音。出力機器が鳴り始める前に冒頭が欠けるのを防ぎ、
// 順番に再生するときの区切りにもなる
const LEAD_SECONDS = 0.4;

async function fetchAudio(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: null }));
    throw new Error(error ?? `音声を取得できませんでした (${res.status})`);
  }
  return ctx.decodeAudioData(await res.arrayBuffer());
}

// 音声を順番に再生する。すべて読み込み終えてから鳴らし始める。
// 新しく再生を始めると、再生中のものは止まる
export function usePlayer() {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  // 読み込み済みの音声。同じ音声を二度取りに行かない
  const buffersRef = useRef(new Map<string, Promise<AudioBuffer>>());
  // 再生のたびに増やし、古い再生の続きが割り込まないようにする
  const runRef = useRef(0);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    runRef.current++;
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlaying(null);
  }, []);

  const play = useCallback(async (id: string, urls: string[]) => {
    const ctx = (ctxRef.current ??= new AudioContext());
    const run = ++runRef.current;
    sourceRef.current?.stop();
    sourceRef.current = null;
    setError(null);
    setPlaying({ id, index: 0, loading: true });

    const load = (url: string) => {
      let buffer = buffersRef.current.get(url);
      if (!buffer) {
        buffer = fetchAudio(ctx, url);
        // 失敗したものは覚えず、次の再生で取り直す
        buffer.catch(() => buffersRef.current.delete(url));
        buffersRef.current.set(url, buffer);
      }
      return buffer;
    };

    try {
      // resume はクリックの処理中に呼ぶ必要があるので、待つ前に始めておく
      const [buffers] = await Promise.all([Promise.all(urls.map(load)), ctx.resume()]);
      for (const [index, buffer] of buffers.entries()) {
        if (runRef.current !== run) return;
        setPlaying({ id, index, loading: false });
        await new Promise<void>((resolve) => {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.onended = () => resolve();
          source.start(ctx.currentTime + LEAD_SECONDS);
          sourceRef.current = source;
        });
      }
    } catch (e) {
      if (runRef.current !== run) return;
      setError(e instanceof Error ? e.message : "音声を再生できませんでした。");
    }
    if (runRef.current !== run) return;
    setPlaying(null);
  }, []);

  useEffect(
    () => () => {
      stop();
      ctxRef.current?.close();
      ctxRef.current = null;
      buffersRef.current.clear();
    },
    [stop],
  );

  return { playing, error, play, stop };
}
