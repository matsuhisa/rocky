// Worker に渡される設定。wrangler.jsonc のバインディングと、シークレット・変数
export type Env = {
  DB: D1Database;
  AUDIO: R2Bucket;
  GEMINI_API_KEY: string;
  GEMINI_TTS_MODEL?: string;
  GEMINI_TTS_VOICE?: string;
  // Cloudflare Access のチームのドメイン (例: team.cloudflareaccess.com) と、アプリの AUD タグ
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
};
