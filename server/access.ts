// Cloudflare Access を通ったリクエストだけを受け付ける
import { createMiddleware } from "hono/factory";
import { verifyWithJwks } from "hono/jwt";
import type { Env } from "./env.ts";

export const requireAccess = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  // 手元では Access を通らないので、検証しない
  if (import.meta.env.DEV) return next();

  const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud } = c.env;
  // 設定が無いまま公開されても、誰でも使える状態にはしない
  if (!team || !aud) return c.json({ error: "アクセス制限が設定されていません" }, 403);

  // Access がログイン済みのリクエストに付けるトークン。署名・発行元・宛先・期限を確かめる
  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) return c.json({ error: "ログインが必要です" }, 403);
  try {
    await verifyWithJwks(
      token,
      {
        jwks_uri: `https://${team}/cdn-cgi/access/certs`,
        verification: { iss: `https://${team}`, aud },
        allowedAlgorithms: ["RS256"],
      },
      // 公開鍵は毎回取りに行かず、しばらく使い回す
      { cf: { cacheTtl: 3600 } } as RequestInit,
    );
  } catch {
    return c.json({ error: "ログインを確認できませんでした" }, 403);
  }
  return next();
});
