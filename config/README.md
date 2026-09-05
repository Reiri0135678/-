# config/

このディレクトリの `users.json` と `kintone.json` は秘密情報を含むため Git 管理外(.gitignore)。

- `users.json`: `node scripts/add-user.mjs <名前> <パスワード> [admin|member|viewer]` で作成
- `kintone.json`: `kintone.example.json` をコピーして値を埋める
  - `fields` の右辺は kintone アプリのフィールドコード
  - `shape_id` は文字列1行(重複禁止推奨)。`request_no` は受付番号(文字列1行、重複禁止推奨)
  - `status` はドロップダウンで「未受付/受付/検査中/保留/差戻し/完了/取消」、`priority` はドロップダウンで「通常/至急」を用意
  - `requested_at` / `due_date` は日付、`note` は文字列複数行、その他は文字列1行
  - 受付番号を外部キーにしたい場合は `shapeId` の行を消し、`no` を残す(サーバーは `fields` に `shapeId` があればそれを、無ければ `no` を外部キーに使う)
