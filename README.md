# 業務改善アプリ プロジェクト（構想〜実装）

製造業の業務改善を目的としたアプリケーションを、**構想決定 → 設計 → MVP実装 → 現場試行 → 展開** の順で進めるためのリポジトリ。

## 現在のフェーズ

**Phase 2: MVP 実装**（構想: 改善提案・困りごとボード = Kaizen Board）

- 候補と評価: [docs/00_concept-candidates.md](docs/00_concept-candidates.md)
- ロードマップ: [docs/01_roadmap.md](docs/01_roadmap.md)
- 技術選定の比較: [docs/02_tech-stack-options.md](docs/02_tech-stack-options.md)
- 要件: [docs/03_requirements.md](docs/03_requirements.md)
- kintone アプリ設計: [docs/04_kintone-app-design.md](docs/04_kintone-app-design.md)
- 画面と API: [docs/05_screens-and-api.md](docs/05_screens-and-api.md)
- 決定記録 (ADR): [docs/adr/](docs/adr/)

## 進め方のルール

1. 構想・技術の決定は ADR に 1 件ずつ残す（後から「なぜ」を追える）。
2. 各フェーズには **完了条件** を置き、満たすまで次に進まない。
3. URL・ID・認証情報は Git に入れない（`.env` はコミット対象外）。
4. MVP は「現場で 1 週間使える最小」を目指し、機能を足す前に使ってもらう。

## セットアップと起動

前提: Node.js 22 以上。

```bash
npm install
cp .env.example .env        # まずは KINTONE_MODE=mock のままで可
npm run seed                # mock にデモデータ 7 件を投入（任意）
npm run dev                 # BFF: http://localhost:3000 / 画面: http://localhost:5173
```

本番相当（BFF が画面も配信する。事務所 PC 1 台での試行を想定）:

```bash
npm run build               # 型検査 + web のビルド + PWA アイコン生成
npm start                   # http://localhost:3000 を LAN 内の PC / タブレットから開く
```

kintone に接続するときは `.env` を次のように変え、`docs/04_kintone-app-design.md` 通りのアプリを用意する。

```
KINTONE_MODE=kintone
KINTONE_BASE_URL=https://<サブドメイン>.cybozu.com
KINTONE_APP_ID=<アプリ ID>
KINTONE_API_TOKEN=<閲覧・追加・編集権限のトークン>
```

起動時に kintone の選択肢と `shared/src/options.ts` を照合し、差分があれば警告を出す（フォーム定義を取得できない権限の場合はスキップ）。

## 検証

```bash
npm run typecheck           # shared / server / web
npm test                    # shared の検証ロジック、server の API（mock ストア）
```

## 構成

```
shared/   選択肢・フィールドコード・型・入力検証（web と server で共有）
server/   BFF (Express)。/api/* と web/dist の配信。store/mock と store/kintone を切替
web/      PWA (Vite + React)。ボード / 投稿 / 集計 の 3 画面
docs/     構想・要件・kintone 設計・画面/API・ADR
```

## 副作用・注意

- `npm run seed` は `server/data/posts.json` を **上書き** する（mock のみ。kintone には触れない）。
- MVP に認証はない。社内 LAN 内限定で使い、外部公開しない（ADR-0002）。
- 選択肢を変えるときは `shared/src/options.ts` と kintone のドロップダウンを同時に変える。
