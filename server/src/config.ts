import "dotenv/config";

export type Mode = "mock" | "kintone";

export interface Config {
  mode: Mode;
  port: number;
  kintone: { baseUrl: string; appId: string; apiToken: string } | null;
  mockDataFile: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = (env.KINTONE_MODE ?? "mock") as Mode;
  if (mode !== "mock" && mode !== "kintone") {
    throw new Error(`KINTONE_MODE は mock か kintone を指定してください（現在: ${mode}）`);
  }
  const port = Number(env.PORT ?? 3000);

  let kintone: Config["kintone"] = null;
  if (mode === "kintone") {
    const baseUrl = env.KINTONE_BASE_URL?.trim();
    const appId = env.KINTONE_APP_ID?.trim();
    const apiToken = env.KINTONE_API_TOKEN?.trim();
    const missing = [
      !baseUrl && "KINTONE_BASE_URL",
      !appId && "KINTONE_APP_ID",
      !apiToken && "KINTONE_API_TOKEN",
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new Error(`KINTONE_MODE=kintone には ${missing.join(", ")} が必要です`);
    }
    kintone = { baseUrl: baseUrl!, appId: appId!, apiToken: apiToken! };
  }

  return {
    mode,
    port,
    kintone,
    mockDataFile: env.MOCK_DATA_FILE?.trim() || new URL("../data/posts.json", import.meta.url).pathname,
  };
}
