# ADR-0002: 技術構成は「PWA + 薄い BFF（Node）+ kintone」

- 日付: 2026-09-05
- 状態: 承認

## 背景

PC とタブレットの両方から使う（ADR-0001）。データの正は kintone。
ブラウザから kintone REST API を直接呼ぶ構成には次の問題がある。

1. **CORS**: 外部オリジンのブラウザから kintone REST API は呼べない。
2. **認証情報の露出**: API トークンをブラウザに置くと誰でも取り出せる。
3. **ライセンス**: 現場の全員が kintone アカウントを持っているとは限らない。共有タブレットからの投稿には、ユーザーログインに依存しない経路が要る。

## 決定

```
[ブラウザ: PWA (React)] --HTTP--> [BFF: Node + Express] --REST--> [kintone]
        PC / タブレット              API トークン保持            レコード蓄積
```

- **web**: Vite + React + TypeScript。PWA（ホーム画面追加、静的資産のキャッシュ）。
- **server**: Node 22 + Express + TypeScript。静的ファイル配信と `/api/*` を提供。kintone には `@kintone/rest-api-client` で接続。API トークンは `.env` のみに置く。
- **shared**: フィールドコード・型・選択肢・入力検証を web / server で共有。
- **mock モード**: `KINTONE_MODE=mock` で kintone なしに動く（ローカル JSON 保存）。開発・デモ・テスト用。
- **テスト**: Vitest（server のルート、shared の検証）。

## 検討した選択肢

| 選択肢 | 長所 | 短所 | 判断 |
|---|---|---|---|
| kintone カスタマイズ JS のみ | 追加インフラ不要 | 利用者全員に kintone ログインが必要、タブレット UI が作りにくい | 不採用 |
| Electron 単体 | 既存スキル | タブレットで動かない | 不採用（PC 用ラッパーとして Phase 4 で検討） |
| PWA が kintone を直接呼ぶ | サーバ不要 | CORS で不可、トークン露出 | 不可 |
| **PWA + BFF** | 端末を選ばない、トークンを隠せる、ライセンス不要で投稿可 | BFF の置き場所が要る | **採用** |

## 結果・影響

- BFF の置き場所（社内 Windows PC / サーバ / クラウド）は**未確定**。MVP は「事務所の PC 1 台で `npm start`」を想定し、Phase 4 で恒久化する。
- MVP の認証は行わない（社内 LAN 内限定を前提）。ステータス変更の操作者記録は「担当者名の入力」で代替する。外部公開する場合は認証追加が必須。
- Electron が必要になった場合、web をそのまま読み込むだけで済むように、web 側にサーバ URL 設定を持たせる。
