import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadWordData } from "./words.ts";

const app = new Hono();

app.get("/api/words", async (c) => {
  const { words } = await loadWordData();
  return c.json({ words });
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`API サーバー: http://localhost:${port}`);
});
