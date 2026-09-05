import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { api } from "./api";

export function App() {
  const [mode, setMode] = useState<"mock" | "kintone" | "offline" | null>(null);
  useEffect(() => {
    api.health().then((h) => setMode(h.mode)).catch(() => setMode("offline"));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">改善提案・困りごとボード</div>
        <nav className="nav">
          <NavLink to="/" end>ボード</NavLink>
          <NavLink to="/post">投稿</NavLink>
          <NavLink to="/stats">集計</NavLink>
        </nav>
        {mode === "mock" && <span className="badge badge-mock" title="kintone に接続していません">デモ (mock)</span>}
        {mode === "offline" && <span className="badge badge-off">サーバ未接続</span>}
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
