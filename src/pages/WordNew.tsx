import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError, createWord } from "../api.ts";

type ExampleInput = { en: string; ja: string; note: string };

const emptyExample = (): ExampleInput => ({ en: "", ja: "", note: "" });

export function WordNew() {
  const navigate = useNavigate();
  const [word, setWord] = useState("");
  const [examples, setExamples] = useState<ExampleInput[]>([emptyExample()]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const updateExample = (index: number, patch: Partial<ExampleInput>) =>
    setExamples((list) => list.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    try {
      const created = await createWord({ word, examples });
      navigate(`/words/${encodeURIComponent(created.word.word)}`, {
        state: { audioFailed: !created.audioReady },
      });
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : ["登録に失敗しました。"]);
      setSubmitting(false);
    }
  };

  return (
    <main>
      <p>
        <Link to="/">← 一覧</Link>
      </p>
      <h1>単語を登録</h1>
      <form className="word-form" onSubmit={submit}>
        <label>
          単語
          <input
            value={word}
            onChange={(e) => setWord(e.target.value)}
            required
            autoFocus
            lang="en"
          />
        </label>

        {examples.map((example, i) => (
          <fieldset key={i}>
            <legend>例文{i + 1}</legend>
            <label>
              英文
              <textarea
                value={example.en}
                onChange={(e) => updateExample(i, { en: e.target.value })}
                required
                rows={2}
                lang="en"
              />
            </label>
            <label>
              日本語訳
              <textarea
                value={example.ja}
                onChange={(e) => updateExample(i, { ja: e.target.value })}
                required
                rows={2}
              />
            </label>
            <label>
              解説（任意）
              <textarea
                value={example.note}
                onChange={(e) => updateExample(i, { note: e.target.value })}
                rows={2}
              />
            </label>
            {examples.length > 1 && (
              <button
                type="button"
                onClick={() => setExamples((list) => list.filter((_, j) => j !== i))}
              >
                この例文を削除
              </button>
            )}
          </fieldset>
        ))}

        <button type="button" onClick={() => setExamples((list) => [...list, emptyExample()])}>
          ＋ 例文を追加
        </button>

        {errors.length > 0 && (
          <ul className="error">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}

        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? "登録中…（音声を生成しています）" : "登録"}
        </button>
      </form>
    </main>
  );
}
