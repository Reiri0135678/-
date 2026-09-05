# config/

このディレクトリの `users.json` と `kintone.json` は秘密情報を含むため Git 管理外(.gitignore)。

- `users.json`: `node scripts/add-user.mjs <名前> <パスワード> [admin|member|viewer]` で作成
- `kintone.json`: `kintone.example.json` をコピーして値を埋める
  - `fields` の右辺は kintone アプリのフィールドコード
  - `shape_id` は文字列1行(重複禁止推奨)。`status` はドロップダウンで「未受付/受付/検査中/完了」を用意
  - `requested_at` は日付、`note` は文字列複数行、その他は文字列1行
