import { useEffect, useState } from "react";
import { LIMITS, STATUSES, type Post, type Status } from "@kaizen/shared";
import { api, formatDateTime } from "../api";
import { ErrorBox } from "./Feedback";

interface Props {
  post: Post;
  onClose: () => void;
  onUpdated: (p: Post) => void;
}

export function PostDetail({ post, onClose, onUpdated }: Props) {
  const [status, setStatus] = useState<Status>(post.status);
  const [owner, setOwner] = useState(post.owner);
  const [response, setResponse] = useState(post.response);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty = status !== post.status || owner !== post.owner || response !== post.response;

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.update(post.id, { status, owner, response });
      onUpdated(updated);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pd-title" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <div className="muted">No.{post.id} ・ {post.kind} ・ {post.area}</div>
            <h2 id="pd-title">{post.title}</h2>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="閉じる">✕</button>
        </header>

        <dl className="kv">
          <dt>詳細</dt>
          <dd className="pre">{post.detail || <span className="muted">（なし）</span>}</dd>
          <dt>投稿者</dt>
          <dd>{post.reporter || <span className="muted">匿名</span>}</dd>
          <dt>投稿日時</dt>
          <dd>{formatDateTime(post.postedAt)}</dd>
          <dt>完了日時</dt>
          <dd>{formatDateTime(post.completedAt)}</dd>
        </dl>

        <h3>対応</h3>
        <label className="field">
          <span>ステータス</span>
          <div className="toggle-row wrap">
            {STATUSES.map((s) => (
              <button
                type="button"
                key={s}
                className={`toggle status-${STATUSES.indexOf(s)} ${status === s ? "is-on" : ""}`}
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </label>
        <label className="field">
          <span>担当者</span>
          <input value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={LIMITS.owner} />
        </label>
        <label className="field">
          <span>対応コメント <small className="muted">見送りの場合は理由を書く</small></span>
          <textarea value={response} onChange={(e) => setResponse(e.target.value)} maxLength={LIMITS.response} rows={3} />
        </label>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>閉じる</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
