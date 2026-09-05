import express, { Router, type NextFunction, type Request, type Response } from "express";
import {
  AREAS,
  KINDS,
  STATUSES,
  validateCreatePost,
  validateUpdatePost,
  type OptionsResponse,
  type PostFilter,
} from "@kaizen/shared";
import { computeStats } from "../stats.js";
import { StoreError, type PostStore } from "../store/types.js";

export interface ApiDeps {
  store: PostStore;
  mode: "mock" | "kintone";
  now?: () => Date;
}

function fail(res: Response, status: number, code: string, message: string, details?: string[]) {
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });
}

function pickFilter(query: Request["query"]): PostFilter {
  const f: PostFilter = {};
  const s = query.status, a = query.area, k = query.kind;
  if (typeof s === "string" && STATUSES.includes(s as never)) f.status = s as PostFilter["status"];
  if (typeof a === "string" && AREAS.includes(a as never)) f.area = a as PostFilter["area"];
  if (typeof k === "string" && KINDS.includes(k as never)) f.kind = k as PostFilter["kind"];
  return f;
}

export function createApiRouter({ store, mode, now = () => new Date() }: ApiDeps): Router {
  const r = Router();
  // JSON パースをルータ内で行い、パースエラーも下の error handler に届くようにする
  r.use(express.json({ limit: "64kb" }));

  r.get("/health", (_req, res) => {
    res.json({ ok: true, mode });
  });

  r.get("/options", (_req, res) => {
    const body: OptionsResponse = { kinds: KINDS, areas: AREAS, statuses: STATUSES };
    res.json(body);
  });

  r.get("/posts", async (req, res) => {
    res.json(await store.list(pickFilter(req.query)));
  });

  r.get("/posts/:id", async (req, res) => {
    const id = String(req.params.id);
    if (!/^\d+$/.test(id)) return fail(res, 400, "BAD_ID", "ID が不正です");
    const post = await store.get(id);
    if (!post) return fail(res, 404, "NOT_FOUND", `投稿 ${id} は見つかりません`);
    res.json(post);
  });

  r.post("/posts", async (req, res) => {
    const v = validateCreatePost(req.body);
    if (!v.ok) return fail(res, 400, "VALIDATION", "入力内容を確認してください", v.errors);
    const created = await store.create(v.value, now());
    res.status(201).json(created);
  });

  r.patch("/posts/:id", async (req, res) => {
    const id = String(req.params.id);
    if (!/^\d+$/.test(id)) return fail(res, 400, "BAD_ID", "ID が不正です");
    const v = validateUpdatePost(req.body);
    if (!v.ok) return fail(res, 400, "VALIDATION", "入力内容を確認してください", v.errors);
    const updated = await store.update(id, v.value, now());
    if (!updated) return fail(res, 404, "NOT_FOUND", `投稿 ${id} は見つかりません`);
    res.json(updated);
  });

  r.get("/stats", async (_req, res) => {
    res.json(computeStats(await store.list(), now()));
  });

  r.use((_req, res) => fail(res, 404, "NOT_FOUND", "API が見つかりません"));

  // Express 5 は async ハンドラの reject をここに渡す
  r.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof StoreError) {
      return fail(res, err.code === "NOT_FOUND" ? 404 : 502, err.code, err.message);
    }
    if (err && typeof err === "object" && (err as { type?: string }).type === "entity.parse.failed") {
      return fail(res, 400, "BAD_JSON", "JSON の形式が不正です");
    }
    console.error(err);
    fail(res, 500, "INTERNAL", "サーバ内部でエラーが発生しました");
  });

  return r;
}
