# AWS で動かす(EC2 1 台 + Docker Compose + Caddy)

対象: 複数拠点・複数メンバーがブラウザから同時編集できるように、QC Board のサーバーをクラウドに置く。
所要: AWS の権限がある人が 1〜2 時間。副作用: AWS に EC2・EBS・(任意で)S3 と Route 53 のレコードが作られ、月額費用が発生する。
費用の具体額は選ぶインスタンスと地域で変わるため、AWS の料金計算ツールで見積もる。

## 全体像

```
利用者のブラウザ ── HTTPS(443) ──▶ Caddy(証明書を自動取得) ──▶ qc-board(Node 22, :3000)
                                      │                             │
                                  Let's Encrypt                 ./data(ボード・画像・履歴)
                                                                ./backups(世代バックアップ) ── cron: aws s3 sync ──▶ S3
```

- 1 台構成にする理由: ルームをメモリ上に持つ設計なので、複数台に分散すると同じボードが分かれる。品質管理室の規模(同時数十人)なら 1 台で足りる
- Caddy を前段に置く理由: HTTPS の証明書取得・更新が自動で、WebSocket もそのまま中継できる
- データはホストのディレクトリに置く(コンテナを入れ替えても消えない)。EBS のスナップショットと S3 への同期で二重に守る

## 0. 事前に決めること

| 項目 | 例 | 備考 |
|---|---|---|
| ドメイン | `qc-board.example.com` | Route 53 か既存 DNS に A レコードを作る。証明書取得に必須 |
| 公開範囲 | 社内の固定 IP だけ | `QC_ALLOW_IPS` に設定。VPN 経由なら VPN の出口 IP |
| 地域 | 東京(ap-northeast-1) | 利用者に近い地域。データを国内に置く要件があるなら必須 |
| インスタンス | Arm の小型(t4g 系)で開始 | 2 vCPU / 2GB 程度で十分。足りなければ後から大きくできる |
| 保存容量 | EBS 20〜30GB | 図面画像の量で決める。増やすのは簡単、減らすのは大変 |

## 1. EC2 を用意する

1. EC2 → インスタンスを起動。AMI は **Amazon Linux 2023**(Arm 版なら t4g 系)
2. キーペアを作成(SSH 用)。ストレージは gp3 で 20GB 以上
3. セキュリティグループ(受信):
   - 22 (SSH): 管理者の IP のみ
   - 80, 443 (HTTP/HTTPS): `0.0.0.0/0`(証明書取得のため 80 は全開放が必要。アプリ側の IP 制限は Caddy で行う)
4. **Elastic IP** を割り当てて関連付ける(再起動で IP が変わらないように)
5. DNS に A レコード: `qc-board.example.com → Elastic IP`

## 2. サーバーの初期設定(SSH で接続後)

```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
# Docker Compose プラグイン
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
exit   # 再ログインして docker グループを反映
```

```bash
docker --version && docker compose version
git clone <このリポジトリの URL> qc-board
cd qc-board/deploy
cp .env.example .env
nano .env        # QC_DOMAIN, QC_ALLOW_IPS, QC_EMBED_KEY などを埋める
```

## 3. 起動

```bash
cd ~/qc-board/deploy
docker compose --env-file .env up -d --build
docker compose ps                 # qc-board が healthy、caddy が Up になる
docker compose logs -f qc-board   # 起動ログ。httpsProxy=on と出ていること
```

ブラウザで `https://qc-board.example.com/` を開く。初回は Caddy が証明書を取りに行くため数十秒かかる。

### ユーザー登録(パスワード認証にする)

```bash
docker compose exec qc-board node scripts/add-user.mjs 山田 '<パスワード>' admin
docker compose exec qc-board node scripts/add-user.mjs 佐藤 '<パスワード>' member
```

`users.json` は `./data/config/users.json`(ホスト側)に作られる。ファイルが無い間は名前だけで入れるオープンモードなので、
インターネットに公開する前に必ず登録する。

### kintone / 通知

`./data/config/kintone.json`、`./data/config/notify.json` を置く(書き方は `config/README.md`)。置いたら `docker compose restart qc-board`。

## 4. バックアップ

- 自動(コンテナ内): 起動時と `QC_BACKUP_INTERVAL_HOURS` ごとに `./backups/` へ世代コピー(`QC_BACKUP_KEEP` 世代)
- S3 へ同期(推奨): S3 バケットを作り、EC2 に **IAM ロール**(そのバケットへの `s3:PutObject`/`s3:ListBucket`/`s3:DeleteObject`)を付けてから

```bash
sudo dnf install -y awscli
crontab -e
# 毎日 3:30 に同期(バケット名は自分のものに置き換える)
30 3 * * * /usr/bin/aws s3 sync /home/ec2-user/qc-board/deploy/backups s3://<バケット名>/qc-board/ --delete >> /home/ec2-user/s3-sync.log 2>&1
```

- EBS スナップショット: AWS Backup か Data Lifecycle Manager で日次スナップショットを設定すると、OS ごと戻せる
- 復旧: `docker compose down` → `./data` の中身をバックアップの世代フォルダの中身で置き換え → `docker compose up -d`。
  `data/secret`(セッション署名鍵)は含まれないので、復旧後は全員が再ログインになる

## 5. 更新(新しい版を入れる)

```bash
cd ~/qc-board && git pull
cd deploy && docker compose --env-file .env up -d --build
```

`./data` は触らないのでボードの内容は引き継がれる。ダウンタイムはコンテナの入れ替え数十秒。

## 6. 運用のチェックリスト

- [ ] `https://<ドメイン>/api/health` が `{"ok":true,...}` を返す
- [ ] 社外の回線(スマホのテザリング等)からは 403 になる(`QC_ALLOW_IPS` を絞った場合)
- [ ] 2 台のブラウザで同じボードを開き、片方の描画がもう片方に出る
- [ ] `./backups/` に世代フォルダができ、S3 にも同期されている
- [ ] EC2 の再起動後にコンテナが自動で上がる(`restart: unless-stopped`)
- [ ] CloudWatch でディスク使用率のアラームを設定(画像でいっぱいになる前に気付くため)

## 7. セキュリティの補足

- Cookie は HTTPS 前提の `Secure` 付き(`QC_BEHIND_HTTPS_PROXY=1`)。平文 HTTP では動かない前提で運用する
- SSH は鍵認証のみ、22 番は管理者 IP に限定。可能なら **SSM Session Manager** に切り替えて 22 番を閉じる
- `QC_EMBED_KEY` と `.env` は Git に入れない(`.gitignore` 済み)。値は AWS Secrets Manager か Parameter Store に控える
- 画像や品質データがクラウドに置かれることについて、社内の情報管理規程の確認を先に済ませる

## 別案: ECS Fargate で動かす

コンテナ基盤に統一したい場合は Fargate でも動く。ただし次の制約がある。

- タスク数は **1** に固定する(ルームがメモリ上にあるため)
- `/data` と `/backups` は **EFS** をマウントする(タスク入れ替えでデータが消えないように)
- 前段は ALB(HTTPS 終端。WebSocket 対応、アイドルタイムアウトを 300 秒以上に)。`QC_BEHIND_HTTPS_PROXY=1` はそのまま使える
- ヘルスチェックは `/api/health`

EC2 1 台より部品が多く費用も上がるため、まず EC2 で始めて必要なら移すのを勧める。
