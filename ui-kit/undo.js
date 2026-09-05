// undo.js — スナップショット方式の履歴（Undo / Redo）
// 参照デモ: 37
//
//   const h = createHistory(initialState, { limit: 100 });
//   h.commit(nextState) / h.undo() / h.redo() / h.state / h.canUndo / h.canRedo / h.subscribe(fn)
// 状態は不変オブジェクトとして扱う（commit には新しいオブジェクトを渡す）。
export function createHistory(initial, { limit = 100 } = {}) {
  let past = [], future = [], state = initial;
  const subs = new Set(), emit = () => subs.forEach(fn => fn(state));
  return {
    get state() { return state; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    commit(next) { past.push(state); if (past.length > limit) past.shift(); future = []; state = next; emit(); return state; },
    undo() { if (!past.length) return state; future.push(state); state = past.pop(); emit(); return state; },
    redo() { if (!future.length) return state; past.push(state); state = future.pop(); emit(); return state; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
