import { useEffect, useState } from "react";
import { AREAS, KINDS, STATUSES, type Stats } from "@kaizen/shared";
import { api } from "../api";
import { ErrorBox, Loading } from "../components/Feedback";

export function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.stats().then(setStats).catch(setError);
  }, []);

  if (error) return <section className="page"><ErrorBox error={error} /></section>;
  if (!stats) return <section className="page"><Loading /></section>;

  const open = stats.byStatus["受付"] + stats.byStatus["検討中"] + stats.byStatus["実施中"];

  return (
    <section className="page">
      <h1>集計</h1>

      <div className="tiles">
        <div className="tile tile-hero">
          <div className="tile-label">対応中（受付 + 検討中 + 実施中）</div>
          <div className="tile-value">{open}</div>
          <div className="muted">全 {stats.total} 件</div>
        </div>
        {STATUSES.map((s, i) => (
          <div className={`tile status-${i}`} key={s}>
            <div className="tile-label">{s}</div>
            <div className="tile-value">{stats.byStatus[s]}</div>
          </div>
        ))}
      </div>

      <WeeklyChart weekly={stats.weekly} />

      <h2>区分 × 場所</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>区分</th>
              {AREAS.map((a) => <th key={a}>{a}</th>)}
              <th>計</th>
            </tr>
          </thead>
          <tbody>
            {KINDS.map((k) => {
              const row = stats.byKindArea[k];
              const sum = AREAS.reduce((n, a) => n + row[a], 0);
              return (
                <tr key={k}>
                  <th>{k}</th>
                  {AREAS.map((a) => <td key={a}>{row[a] || <span className="muted">0</span>}</td>)}
                  <td><strong>{sum}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 単一系列の棒グラフ。細いマーク、上端のみ角丸、控えめなグリッド、ホバーで値表示。 */
function WeeklyChart({ weekly }: { weekly: Stats["weekly"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = 200, padL = 32, padB = 28, padT = 16, padR = 8;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(1, ...weekly.map((w) => w.count));
  const ticks = niceTicks(max);
  const slot = innerW / weekly.length;
  const barW = Math.min(28, slot * 0.5);
  const y = (v: number) => padT + innerH - (v / ticks.at(-1)!) * innerH;
  const maxIdx = weekly.reduce((mi, w, i) => (w.count > weekly[mi]!.count ? i : mi), 0);

  return (
    <figure className="chart">
      <figcaption>
        <strong>週ごとの投稿数</strong> <span className="muted">直近 {weekly.length} 週・週の始まりは月曜</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="週ごとの投稿数の棒グラフ" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="grid" />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="axis-text">{t}</text>
          </g>
        ))}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} className="axis-line" />
        {weekly.map((w, i) => {
          const cx = padL + slot * i + slot / 2;
          const top = y(w.count);
          const h = Math.max(0, y(0) - top);
          const r = Math.min(4, h);
          const label = w.weekStart.slice(5).replace("-", "/");
          const isHover = hover === i;
          return (
            <g key={w.weekStart} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />
              {h > 0 && (
                <path
                  className={`bar ${isHover ? "is-hover" : ""}`}
                  d={`M${cx - barW / 2},${y(0)} V${top + r} a${r},${r} 0 0 1 ${r},-${r} H${cx + barW / 2 - r} a${r},${r} 0 0 1 ${r},${r} V${y(0)} Z`}
                />
              )}
              {(isHover || (hover === null && i === maxIdx && w.count > 0)) && (
                <text x={cx} y={top - 6} textAnchor="middle" className="bar-label">{w.count}</text>
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className="axis-text">{label}</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" role="status">
          {weekly[hover]!.weekStart} の週: <strong>{weekly[hover]!.count}</strong> 件
        </div>
      )}
    </figure>
  );
}

function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : Math.ceil(max / 5 / 10) * 10;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}
