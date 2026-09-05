# 業務改善アプリ プロジェクト（構想〜実装）

製造業の業務改善を目的としたアプリケーションを、**構想決定 → 設計 → MVP実装 → 現場試行 → 展開** の順で進めるためのリポジトリ。

## 現在のフェーズ

**Phase 0: 構想決定**（未完了）

- 候補と評価: [docs/00_concept-candidates.md](docs/00_concept-candidates.md)
- ロードマップ: [docs/01_roadmap.md](docs/01_roadmap.md)
- 技術選定の比較: [docs/02_tech-stack-options.md](docs/02_tech-stack-options.md)
- 決定記録 (ADR): [docs/adr/](docs/adr/)

## 進め方のルール

1. 構想・技術の決定は ADR に 1 件ずつ残す（後から「なぜ」を追える）。
2. 各フェーズには **完了条件** を置き、満たすまで次に進まない。
3. URL・ID・認証情報は Git に入れない（`.env` はコミット対象外）。
4. MVP は「現場で 1 週間使える最小」を目指し、機能を足す前に使ってもらう。
