import { Link, useNavigate } from "react-router";
import { createWord } from "../api.ts";
import { WordForm } from "../WordForm.tsx";

export function WordNew() {
  const navigate = useNavigate();

  return (
    <main>
      <p>
        <Link to="/">← 一覧</Link>
      </p>
      <h1>単語を登録</h1>
      <WordForm
        submitLabel="登録"
        submittingLabel="登録中…（音声を生成しています）"
        onSubmit={async (input) => {
          const created = await createWord(input);
          navigate(`/words/${encodeURIComponent(created.word.word)}`, {
            state: { audioFailed: !created.audioReady },
          });
        }}
      />
    </main>
  );
}
