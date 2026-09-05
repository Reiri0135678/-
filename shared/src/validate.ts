import { AREAS, KINDS, LIMITS, STATUSES } from "./options.js";
import type { CreatePostInput, UpdatePostInput } from "./types.js";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function optionalText(
  v: unknown,
  name: string,
  max: number,
  errors: string[],
): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") {
    errors.push(`${name} は文字列で指定してください`);
    return undefined;
  }
  const t = v.trim();
  if (t.length > max) errors.push(`${name} は ${max} 文字以内にしてください`);
  return t;
}

export function validateCreatePost(body: unknown): ValidationResult<CreatePostInput> {
  const errors: string[] = [];
  if (!isRecord(body)) return { ok: false, errors: ["リクエスト本文が不正です"] };

  const kind = body.kind;
  if (!KINDS.includes(kind as never)) errors.push("区分が不正です");

  const area = body.area;
  if (!AREAS.includes(area as never)) errors.push("場所が不正です");

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length === 0) errors.push("タイトルを入力してください");
  if (title.length > LIMITS.title) errors.push(`タイトルは ${LIMITS.title} 文字以内にしてください`);

  const detail = optionalText(body.detail, "詳細", LIMITS.detail, errors);
  const reporter = optionalText(body.reporter, "お名前", LIMITS.reporter, errors);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: kind as CreatePostInput["kind"],
      area: area as CreatePostInput["area"],
      title,
      detail: detail ?? "",
      reporter: reporter ?? "",
    },
  };
}

export function validateUpdatePost(body: unknown): ValidationResult<UpdatePostInput> {
  const errors: string[] = [];
  if (!isRecord(body)) return { ok: false, errors: ["リクエスト本文が不正です"] };

  const out: UpdatePostInput = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as never)) errors.push("ステータスが不正です");
    else out.status = body.status as UpdatePostInput["status"];
  }
  const owner = optionalText(body.owner, "担当者", LIMITS.owner, errors);
  if (owner !== undefined) out.owner = owner;
  const response = optionalText(body.response, "対応コメント", LIMITS.response, errors);
  if (response !== undefined) out.response = response;

  if (Object.keys(out).length === 0 && errors.length === 0) {
    errors.push("更新する項目がありません");
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}
