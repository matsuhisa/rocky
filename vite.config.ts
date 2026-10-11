import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // cloudflare プラグインが、手元でも Workers と同じ環境で server/ を動かす
  plugins: [react(), cloudflare()],
});
