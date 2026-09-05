import { CLOSED_STATUSES, type Post, type UpdatePostInput } from "@kaizen/shared";

/** kintone の日時フィールドが受け付ける形式（ミリ秒なし UTC） */
export function toKintoneDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * 更新パッチを投稿に適用する。mock / kintone 両方で同じ規則を使う。
 * 完了・見送りへ変わった時だけ completed_at を打ち、それ以外へ戻ったら消す。
 */
export function applyPatch(post: Post, patch: UpdatePostInput, now: Date): Post {
  const next: Post = { ...post };
  if (patch.owner !== undefined) next.owner = patch.owner;
  if (patch.response !== undefined) next.response = patch.response;
  if (patch.status !== undefined && patch.status !== post.status) {
    next.status = patch.status;
    const wasClosed = CLOSED_STATUSES.includes(post.status);
    const isClosed = CLOSED_STATUSES.includes(patch.status);
    if (isClosed && !wasClosed) next.completedAt = toKintoneDateTime(now);
    if (!isClosed) next.completedAt = null;
  }
  return next;
}

export function matchesFilter(post: Post, filter: { status?: string; area?: string; kind?: string }): boolean {
  if (filter.status && post.status !== filter.status) return false;
  if (filter.area && post.area !== filter.area) return false;
  if (filter.kind && post.kind !== filter.kind) return false;
  return true;
}
