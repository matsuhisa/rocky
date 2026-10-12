import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Word } from "../../shared/types.ts";
import { fetchWord, updateWord } from "../api.ts";
import { WordForm } from "../WordForm.tsx";

export function WordEdit() {
  const { word: wordParam = "" } = useParams();
  const navigate = useNavigate();
  const [word, setWord] = useState<Word | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const detailPath = `/words/${encodeURIComponent(wordParam)}`;

  useEffect(() => {
    setWord(null);
    setLoadError(null);
    fetchWord(wordParam)
      .then((data) => setWord(data.word))
      .catch((e: Error) => setLoadError(e.message));
  }, [wordParam]);

  return (
    <main>
      <p>
        <Link to={detailPath}>← {wordParam}</Link>
      </p>
      <h1>単語を編集</h1>
      {loadError && <p className="error">{loadError}</p>}
      {!loadError && !word && <p>読み込み中…</p>}
      {word && (
        <WordForm
          // 別の単語に移ったら、入力中の内容を引き継がない
          key={word.word}
          initial={word}
          submitLabel="保存"
          submittingLabel="保存中…（音声を生成しています）"
          onSubmit={async (input) => {
            const saved = await updateWord(wordParam, input);
            // 単語そのものを直した場合は、新しい単語の詳細に移る
            navigate(`/words/${encodeURIComponent(saved.word.word)}`, {
              state: { audioFailed: !saved.audioReady },
            });
          }}
        />
      )}
    </main>
  );
}
