import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import type { SequenceField, Word } from "../../shared/types.ts";
import { audioUrl, fetchWord } from "../api.ts";
import { PLAYBACK_RATES, REWIND_SECONDS, usePlayer } from "../usePlayer.ts";

const FIELD_LABELS: Record<SequenceField, string> = {
  word: "単語",
  meaning: "意味",
  en: "英文",
  ja: "日本語訳",
};

export function WordDetail() {
  const { word: wordParam = "" } = useParams();
  const [data, setData] = useState<{ word: Word; sequence: SequenceField[] } | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const { playing, error: playError, rate, play, stop, rewind, setRate } = usePlayer();
  // 保存の直後に音声の生成が失敗していた場合、登録・編集画面から渡される
  const audioFailed = (useLocation().state as { audioFailed?: boolean } | null)?.audioFailed;

  useEffect(() => {
    setData(null);
    setLoadError(null);
    fetchWord(wordParam)
      .then(setData)
      .catch((e: Error) => setLoadError(e.message));
  }, [wordParam]);

  // 1つだけ再生するボタン。再生中に押すと止まる。index は意味または例文の何番目か
  const playButton = (id: string, field: SequenceField, index = 0) => {
    const active = playing?.id === id;
    return (
      <button
        type="button"
        className="play"
        aria-label={`${FIELD_LABELS[field]}を${active ? "停止" : "再生"}`}
        onClick={() => (active ? stop() : play(id, [audioUrl(wordParam, field, index)]))}
      >
        {!active ? "▶" : playing.loading ? "…" : "■"}
      </button>
    );
  };

  return (
    <main>
      <p>
        <Link to="/">← 一覧</Link>
      </p>
      {loadError && <p className="error">{loadError}</p>}
      {!loadError && !data && <p>読み込み中…</p>}
      {data && (
        <>
          <h1>
            {data.word.word} {playButton("word", "word")}
          </h1>
          {data.word.meanings.length > 0 && (
            <ol className="meanings">
              {data.word.meanings.map((meaning, i) => (
                <li key={i}>
                  {meaning} {playButton(`meaning-${i}`, "meaning", i)}
                </li>
              ))}
            </ol>
          )}
          {audioFailed && (
            <p className="error">
              保存はできましたが、音声の生成に失敗しました。再生するときにもう一度生成します。
            </p>
          )}
          {playError && <p className="error">{playError}</p>}
          <p>
            <label>
              再生スピード{" "}
              <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
                {PLAYBACK_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r === 1 ? "1.0 / 標準" : r.toFixed(1)}
                  </option>
                ))}
              </select>
            </label>
          </p>
          {data.word.examples.map((example, i) => {
            const sequenceId = `sequence-${i}`;
            const active = playing?.id === sequenceId;
            // 意味の番では登録されている意味をすべて読む。意味が無い単語では番ごと飛ばす
            const steps = data.sequence
              .map((field) => ({
                field,
                urls:
                  field === "meaning"
                    ? data.word.meanings.map((_, m) => audioUrl(wordParam, field, m))
                    : [audioUrl(wordParam, field, i)],
              }))
              .filter((step) => step.urls.length > 0);
            // 再生中の音声が何番目の番にあたるか
            const currentStep =
              active && !playing.loading
                ? steps.flatMap((step, s) => step.urls.map(() => s))[playing.index]
                : -1;
            return (
              <section key={i} className="example-card">
                <p className="en">
                  {example.en} {playButton(`en-${i}`, "en", i)}
                </p>
                <p className="ja">
                  {example.ja} {playButton(`ja-${i}`, "ja", i)}
                </p>
                {example.note && <p className="note">{example.note}</p>}
                <div className="sequence">
                  <button
                    type="button"
                    onClick={() =>
                      active
                        ? stop()
                        : play(sequenceId, steps.flatMap((step) => step.urls))
                    }
                  >
                    {!active ? "▶ 順番に再生" : playing.loading ? "読み込み中…" : "■ 停止"}
                  </button>
                  {active && !playing.loading && (
                    <button type="button" onClick={rewind}>
                      ⏪ {REWIND_SECONDS}秒戻る
                    </button>
                  )}
                  <ol>
                    {steps.map(({ field }, s) => (
                      <li key={s} className={currentStep === s ? "current" : undefined}>
                        {FIELD_LABELS[field]}
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            );
          })}
          <p className="page-actions">
            <Link to={`/words/${encodeURIComponent(data.word.word)}/edit`}>この単語を編集</Link>
          </p>
        </>
      )}
    </main>
  );
}
