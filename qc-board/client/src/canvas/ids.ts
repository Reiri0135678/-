/** 図形 id。時刻 + 乱数で衝突しにくくする(全員が同時に作っても重ならない前提) */
export function newId(): string {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** グループ id */
export function newGroupId(): string {
  return `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
