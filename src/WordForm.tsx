import { useState, type FormEvent } from "react";
import type { Word } from "../shared/types.ts";
import { ApiError } from "./api.ts";

type ExampleInput = { en: string; ja: string; note: string };

const emptyExample = (): ExampleInput => ({ en: "", ja: "", note: "" });

type Props = {
  // 編集のときの元の内容。登録のときは渡さない
  initial?: Word;
  submitLabel: string;
  submittingLabel: string;
  // 保存する。入力の誤りは ApiError で知らせる
  onSubmit: (word: Word) => Promise<void>;
};

// 単語と例文の入力フォーム。登録と編集で共用する
export function WordForm({ initial, submitLabel, submittingLabel, onSubmit }: Props) {
  const [word, setWord] = useState(initial?.word ?? "");
  const [examples, setExamples] = useState<ExampleInput[]>(
    initial?.examples.map((e) => ({ ...e, note: e.note ?? "" })) ?? [emptyExample()],
  );
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const updateExample = (index: number, patch: Partial<ExampleInput>) =>
    setExamples((list) => list.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors([]);
    try {
      await onSubmit({ word, examples });
    } catch (e) {
      setErrors(e instanceof ApiError ? e.errors : ["保存に失敗しました。"]);
      setSubmitting(false);
    }
  };

  return (
    <form className="word-form" onSubmit={submit}>
      <label>
        単語
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          required
          autoFocus={!initial}
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
        {submitting ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
