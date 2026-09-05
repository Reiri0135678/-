import type { ApiError, CreatePostInput, OptionsResponse, Post, PostFilter, Stats, UpdatePostInput } from "@kaizen/shared";

/**
 * BFF の URL。同一オリジン配信が基本。
 * Electron などから別ホストの BFF を使う場合は VITE_API_BASE を設定する。
 */
const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ?? "";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK", "サーバに接続できません。ネットワークを確認してください");
  }
  if (!res.ok) {
    let body: ApiError | null = null;
    try {
      body = (await res.json()) as ApiError;
    } catch {
      /* not json */
    }
    throw new ApiRequestError(
      res.status,
      body?.error.code ?? "HTTP",
      body?.error.message ?? `エラー (${res.status})`,
      body?.error.details ?? [],
    );
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => call<{ ok: boolean; mode: "mock" | "kintone" }>("/health"),
  options: () => call<OptionsResponse>("/options"),
  posts: (filter: PostFilter = {}) => {
    const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]);
    const s = qs.toString();
    return call<Post[]>(`/posts${s ? `?${s}` : ""}`);
  },
  post: (id: string) => call<Post>(`/posts/${id}`),
  create: (input: CreatePostInput) => call<Post>("/posts", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, patch: UpdatePostInput) =>
    call<Post>(`/posts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  stats: () => call<Stats>("/stats"),
};

export function formatRelative(iso: string, now = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min} 分前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 時間前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}
