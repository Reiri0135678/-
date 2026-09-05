/**
 * 選択肢の一元管理。
 * kintone 側のドロップダウン選択肢と必ず一致させること（docs/04 参照）。
 */
export const KINDS = ["困りごと", "改善提案"] as const;
export type Kind = (typeof KINDS)[number];

export const AREAS = ["第1ライン", "第2ライン", "倉庫", "事務所", "その他"] as const;
export type Area = (typeof AREAS)[number];

export const STATUSES = ["受付", "検討中", "実施中", "完了", "見送り"] as const;
export type Status = (typeof STATUSES)[number];

/** 完了扱い（completed_at を打つ）ステータス */
export const CLOSED_STATUSES: readonly Status[] = ["完了", "見送り"];

export const INITIAL_STATUS: Status = "受付";

export const LIMITS = {
  title: 60,
  detail: 2000,
  reporter: 30,
  owner: 30,
  response: 2000,
} as const;
