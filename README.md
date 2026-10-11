# rocky

英単語を覚えるためのウェブアプリ。単語と例文を登録し、Gemini API の音声で読み上げる。

Cloudflare Workers で動く。画面は React、API は Hono、単語データは D1、音声は R2 に保存する。

## 手元で動かす

```
npm install
cp .env.example .env   # GEMINI_API_KEY を記入
npm run dev
```

http://localhost:5173/ で開く。初回と、`migrations/` に追加があったときは、手元のデータベースへの適用を確認される。

手元の D1 と R2 の中身は `.wrangler/` に保存され、Cloudflare には送られない。

## 公開

https://rocky.matsuhisa.workers.dev で動いている。Cloudflare Access でログインした人だけが使える。

```
npm run deploy              # ビルドしてデプロイ
npm run db:migrate:remote   # migrations/ の追加を本番の D1 に適用
```

- API は Access が付けるログイン情報を検証し、無いものは拒否する (`server/access.ts`)。`wrangler.jsonc` の `ACCESS_TEAM_DOMAIN` と `ACCESS_AUD` が Access のアプリと対応している
- `GEMINI_API_KEY` は `wrangler secret put GEMINI_API_KEY` で登録する
- ログインを許可する人は、Cloudflare の Zero Trust の画面で管理する

## その他のコマンド

```
npm run typecheck
npm test
npm run build
```

## 構成

| 場所 | 役割 |
|---|---|
| `src/` | 画面 |
| `server/` | API (Worker) |
| `shared/` | 画面と API で共用する型と設定。読み上げ順は `shared/sequence.ts` |
| `migrations/` | D1 のテーブル定義 |
| `wrangler.jsonc` | Worker の設定 |
