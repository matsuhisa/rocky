import { useCallback, useEffect, useRef, useState } from "react";

// いま再生中のもの。id は再生を始めたボタン、index は urls の何番目か
export type Playing = { id: string; index: number };

// 音声を順番に再生する。新しく再生を始めると、再生中のものは止まる
export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 再生のたびに増やし、古い再生の続きが割り込まないようにする
  const runRef = useRef(0);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    runRef.current++;
    audioRef.current?.pause();
    setPlaying(null);
  }, []);

  const play = useCallback(async (id: string, urls: string[]) => {
    // 同じ要素を使い回す (Safari は操作で一度再生した要素にだけ連続再生を許す)
    const audio = (audioRef.current ??= new Audio());
    const run = ++runRef.current;
    setError(null);
    try {
      for (const [index, url] of urls.entries()) {
        setPlaying({ id, index });
        audio.src = url;
        await audio.play();
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error("再生エラー"));
        });
        if (runRef.current !== run) return;
      }
    } catch {
      if (runRef.current !== run) return;
      setError("音声を再生できませんでした。サーバーのログを確認してください。");
    }
    setPlaying(null);
  }, []);

  useEffect(() => stop, [stop]);

  return { playing, error, play, stop };
}
