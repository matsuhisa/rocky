import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Word } from "../../shared/types.ts";
import { fetchWords } from "../api.ts";

export function WordList() {
  const [words, setWords] = useState<Word[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWords()
      .then(setWords)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <main>
      <h1>単語一覧</h1>
      <p>
        <Link to="/new">＋ 単語を登録</Link>
      </p>
      {error && <p className="error">{error}</p>}
      {!error && !words && <p>読み込み中…</p>}
      {words?.length === 0 && <p>まだ単語がありません。</p>}
      {words && words.length > 0 && (
        <ul className="word-list">
          {words.map(({ word, examples }) => (
            <li key={word}>
              <Link className="word" to={`/words/${encodeURIComponent(word)}`}>
                {word}
              </Link>
              <span className="example">{examples[0]?.en}</span>
              <span className="count">例文 {examples.length}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
