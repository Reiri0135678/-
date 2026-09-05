import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// 開発時は /api を BFF (localhost:3000) へ転送する。本番は BFF が dist を配信する。
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "改善提案・困りごとボード",
        short_name: "Kaizen Board",
        description: "現場の困りごと・改善提案を投稿し、進捗を見える化する",
        lang: "ja",
        start_url: "/",
        display: "standalone",
        background_color: "#f6f7f9",
        theme_color: "#1f5fbf",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // API はキャッシュしない（常に最新を取りに行く。失敗時はエラー表示）
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
