# config/

このディレクトリの `users.json` と `kintone.json` は秘密情報を含むため Git 管理外(.gitignore)。

- `users.json`: `node scripts/add-user.mjs <名前> <パスワード> [admin|member|viewer]` で作成
- `kintone.json`: `kintone.example.json` をコピーして値を埋める
  - `fields` の右辺は kintone アプリのフィールドコード
  - `shape_id` は文字列1行(重複禁止推奨)。`request_no` は受付番号(文字列1行、重複禁止推奨)
  - `status` はドロップダウンで「未受付/受付/検査中/保留/差戻し/完了/取消」、`priority` はドロップダウンで「通常/至急」を用意
  - `result` はドロップダウンで「未判定/合格/条件付合格/不合格」
  - `requested_at` / `due_date` / `judged_at` は日付、`note` / `result_note` は文字列複数行、その他は文字列1行
  - 受付番号を外部キーにしたい場合は `shapeId` の行を消し、`no` を残す(サーバーは `fields` に `shapeId` があればそれを、無ければ `no` を外部キーに使う)

## notify.json(通知)

```json
{
  "webhookUrl": "https://<Teams や Slack の Incoming Webhook URL>",
  "format": "teams",
  "events": ["created", "status", "result"],
  "boardUrl": "http://<サーバー>:3000"
}
```

- `format`: `teams`(Adaptive Card 形式)/ `slack`(text 形式)/ `json`(素の JSON)
- `events`: `created`(新規依頼)/ `status`(状態変更)/ `result`(検査結果の判定)/ `assignee`(担当割当)
- 未設定なら通知はサーバーログにだけ出る
