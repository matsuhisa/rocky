import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { SequenceField, Word } from "../../shared/types.ts";
import { audioUrl, fetchWord } from "../api.ts";
import { usePlayer } from "../usePlayer.ts";

const FIELD_LABELS: Record<SequenceField, string> = {
  word: "単語",
  en: "英文",
  ja: "日本語訳",
};

export function WordDetail() {
  const { word: wordParam = "" } = useParams();
  const [data, setData] = useState<{ word: Word; sequence: SequenceField[] } | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const { playing, error: playError, play, stop } = usePlayer();

  useEffect(() => {
    setData(null);
    setLoadError(null);
    fetchWord(wordParam)
      .then(setData)
      .catch((e: Error) => setLoadError(e.message));
  }, [wordParam]);

  // 1つだけ再生するボタン。再生中に押すと止まる
  const playButton = (id: string, field: SequenceField, example = 0) => {
    const active = playing?.id === id;
    return (
      <button
        type="button"
        className="play"
        aria-label={`${FIELD_LABELS[field]}を${active ? "停止" : "再生"}`}
        onClick={() => (active ? stop() : play(id, [audioUrl(wordParam, field, example)]))}
      >
        {active ? "■" : "▶"}
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
          {playError && <p className="error">{playError}</p>}
          {data.word.examples.map((example, i) => {
            const sequenceId = `sequence-${i}`;
            const active = playing?.id === sequenceId;
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
                        : play(
                            sequenceId,
                            data.sequence.map((field) => audioUrl(wordParam, field, i)),
                          )
                    }
                  >
                    {active ? "■ 停止" : "▶ 順番に再生"}
                  </button>
                  <ol>
                    {data.sequence.map((field, step) => (
                      <li
                        key={step}
                        className={active && playing.index === step ? "current" : undefined}
                      >
                        {FIELD_LABELS[field]}
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
