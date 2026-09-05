import { ApiRequestError } from "../api";

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as Partial<ApiRequestError>;
  return (
    <div className="alert alert-error" role="alert">
      <div>{e.message ?? "エラーが発生しました"}</div>
      {e.details && e.details.length > 0 && (
        <ul>
          {e.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Loading({ label = "読み込み中…" }: { label?: string }) {
  return <div className="muted">{label}</div>;
}
