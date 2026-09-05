import type { Area, Kind, Status } from "./options.js";

/** アプリ内で扱う投稿 1 件（kintone のレコード形式から変換済み） */
export interface Post {
  id: string;
  title: string;
  kind: Kind;
  area: Area;
  detail: string;
  reporter: string;
  status: Status;
  owner: string;
  response: string;
  /** ISO 8601 (UTC) */
  postedAt: string;
  /** ISO 8601 (UTC) or null */
  completedAt: string | null;
}

export interface CreatePostInput {
  kind: Kind;
  area: Area;
  title: string;
  detail?: string;
  reporter?: string;
}

export interface UpdatePostInput {
  status?: Status;
  owner?: string;
  response?: string;
}

export interface PostFilter {
  status?: Status;
  area?: Area;
  kind?: Kind;
}

export interface Stats {
  total: number;
  byStatus: Record<Status, number>;
  /** kind -> area -> count */
  byKindArea: Record<Kind, Record<Area, number>>;
  /** 直近 N 週。weekStart は月曜 (YYYY-MM-DD) */
  weekly: { weekStart: string; count: number }[];
}

export interface OptionsResponse {
  kinds: readonly Kind[];
  areas: readonly Area[];
  statuses: readonly Status[];
}

export interface ApiError {
  error: { code: string; message: string; details?: string[] };
}
