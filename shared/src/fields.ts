/**
 * kintone のフィールドコード。docs/04_kintone-app-design.md と一致させる。
 * ここ以外にフィールドコードの文字列を書かない。
 */
export const FIELD = {
  id: "$id",
  title: "title",
  kind: "kind",
  area: "area",
  detail: "detail",
  reporter: "reporter",
  status: "status",
  owner: "owner",
  response: "response",
  postedAt: "posted_at",
  completedAt: "completed_at",
} as const;

export type FieldCode = (typeof FIELD)[keyof typeof FIELD];
