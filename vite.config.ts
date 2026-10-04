import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // API は別プロセスの Hono サーバーに流す
    proxy: { "/api": "http://localhost:8787" },
  },
});
