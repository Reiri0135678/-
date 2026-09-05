import { useCallback, useEffect, useMemo, useState } from "react";
import { AREAS, KINDS, STATUSES, type Area, type Kind, type Post } from "@kaizen/shared";
import { api, formatRelative } from "../api";
import { ErrorBox, Loading } from "../components/Feedback";
import { PostDetail } from "../components/PostDetail";

export function BoardPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [area, setArea] = useState<Area | "">("");
  const [kind, setKind] = useState<Kind | "">("");
  const [selected, setSelected] = useState<Post | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPosts(await api.posts());
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // 掲示用に 1 分ごとに更新
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(
    () => (posts ?? []).filter((p) => (!area || p.area === area) && (!kind || p.kind === kind)),
    [posts, area, kind],
  );

  const columns = STATUSES.map((s) => ({ status: s, items: filtered.filter((p) => p.status === s) }));

  function onUpdated(p: Post) {
    setPosts((prev) => (prev ?? []).map((x) => (x.id === p.id ? p : x)));
    setSelected(null);
  }

  return (
    <section className="page">
      <div className="toolbar">
        <h1>ボード</h1>
        <div className="filters">
          <label>
            場所
            <select value={area} onChange={(e) => setArea(e.target.value as Area | "")}>
              <option value="">すべて</option>
              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label>
            区分
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind | "")}>
              <option value="">すべて</option>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          <button type="button" className="btn" onClick={load}>更新</button>
        </div>
      </div>
      <ErrorBox error={error} />
      {posts === null && !error && <Loading />}
      {posts !== null && (
        <div className="board">
          {columns.map(({ status, items }, i) => (
            <div className={`column status-${i}`} key={status}>
              <div className="column-head">
                <span>{status}</span>
                <span className="count">{items.length}</span>
              </div>
              <div className="cards">
                {items.length === 0 && <div className="muted empty">なし</div>}
                {items.map((p) => (
                  <button type="button" className="card" key={p.id} onClick={() => setSelected(p)}>
                    <div className="card-meta">
                      <span className={`chip kind-${KINDS.indexOf(p.kind)}`}>{p.kind}</span>
                      <span className="muted">{p.area}</span>
                    </div>
                    <div className="card-title">{p.title}</div>
                    <div className="card-foot muted">
                      <span>No.{p.id}</span>
                      <span>{p.owner ? `担当: ${p.owner}` : p.reporter || "匿名"}</span>
                      <span>{formatRelative(p.postedAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {selected && <PostDetail post={selected} onClose={() => setSelected(null)} onUpdated={onUpdated} />}
    </section>
  );
}
