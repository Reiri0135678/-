import { AREAS, KINDS, STATUSES, type Area, type Kind, type Post, type Stats, type Status } from "@kaizen/shared";

/** その日を含む週の月曜 (UTC) を YYYY-MM-DD で返す */
export function weekStartOf(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // 月=0
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function computeStats(posts: Post[], now: Date, weeks = 8): Stats {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  const byKindArea = Object.fromEntries(
    KINDS.map((k) => [k, Object.fromEntries(AREAS.map((a) => [a, 0]))]),
  ) as Record<Kind, Record<Area, number>>;

  const weekStarts: string[] = [];
  const cursor = new Date(weekStartOf(now.toISOString()));
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setUTCDate(d.getUTCDate() - i * 7);
    weekStarts.push(d.toISOString().slice(0, 10));
  }
  const weeklyMap = new Map(weekStarts.map((w) => [w, 0]));

  for (const p of posts) {
    if (p.status in byStatus) byStatus[p.status]++;
    const row = byKindArea[p.kind];
    if (row && p.area in row) row[p.area]++;
    const w = weekStartOf(p.postedAt);
    if (weeklyMap.has(w)) weeklyMap.set(w, weeklyMap.get(w)! + 1);
  }

  return {
    total: posts.length,
    byStatus,
    byKindArea,
    weekly: weekStarts.map((weekStart) => ({ weekStart, count: weeklyMap.get(weekStart) ?? 0 })),
  };
}
