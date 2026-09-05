import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createApiRouter, type ApiDeps } from "./routes/api.js";

export interface AppOptions extends ApiDeps {
  /** ビルド済み web の dist。存在すれば静的配信 + SPA フォールバック */
  staticDir?: string;
}

export function createApp(opts: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", createApiRouter(opts));

  if (opts.staticDir && existsSync(opts.staticDir)) {
    const dir = resolve(opts.staticDir);
    app.use(express.static(dir, { index: "index.html" }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(resolve(dir, "index.html"));
    });
  }
  return app;
}
