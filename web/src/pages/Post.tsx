import { useEffect, useState, type FormEvent } from "react";
import { AREAS, KINDS, LIMITS, type Area, type Kind, type Post } from "@kaizen/shared";
import { api } from "../api";
import { ErrorBox } from "../components/Feedback";

const LAST_AREA_KEY = "kaizen.lastArea";

function readLastArea(): Area {
  try {
    const v = localStorage.getItem(LAST_AREA_KEY);
    if (v && (AREAS as readonly string[]).includes(v)) return v as Area;
  } catch { /* storage unavailable */ }
  return AREAS[0];
}

export function PostPage() {
  const [kind, setKind] = useState<Kind>(KINDS[0]);
  const [area, setArea] = useState<Area>(readLastArea);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [reporter, setReporter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<Post | null>(null);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(t);
  }, [done]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.create({ kind, area, title, detail, reporter });
      try { localStorage.setItem(LAST_AREA_KEY, area); } catch { /* ignore */ }
      setDone(created);
      setTitle("");
      setDetail("");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page page-narrow">
      <h1>困りごと・提案を投稿</h1>
      {done && (
        <div className="alert alert-ok" role="status">
          受け付けました（No.{done.id}）。ありがとうございます。
        </div>
      )}
      <form className="form" onSubmit={submit}>
        <fieldset className="field">
          <legend>区分</legend>
          <div className="toggle-row">
            {KINDS.map((k) => (
              <button
                type="button"
                key={k}
                className={`toggle ${kind === k ? "is-on" : ""}`}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>場所</span>
          <select value={area} onChange={(e) => setArea(e.target.value as Area)}>
            {AREAS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>タイトル <em className="req">必須</em> <small className="muted">{title.trim().length}/{LIMITS.title}</small></span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={LIMITS.title}
            placeholder="例: 工具棚が遠くて往復が多い"
            required
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span>詳細 <small className="muted">任意</small></span>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            maxLength={LIMITS.detail}
            rows={4}
            placeholder="いつ・どこで・どう困るか。提案なら期待する効果"
          />
        </label>

        <label className="field">
          <span>お名前 <small className="muted">任意（空なら匿名）</small></span>
          <input
            value={reporter}
            onChange={(e) => setReporter(e.target.value)}
            maxLength={LIMITS.reporter}
            autoComplete="name"
          />
        </label>

        <ErrorBox error={error} />
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy || title.trim().length === 0}>
          {busy ? "送信中…" : "投稿する"}
        </button>
      </form>
    </section>
  );
}
