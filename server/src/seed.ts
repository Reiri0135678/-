/**
 * mock モードにデモ用データを投入する。既存データは上書きする。
 *   npm run seed
 */
import { loadConfig } from "./config.js";
import { MockStore } from "./store/mock.js";
import { rm } from "node:fs/promises";

const config = loadConfig();
if (config.mode !== "mock") {
  console.error("seed は KINTONE_MODE=mock でのみ実行できます");
  process.exit(1);
}
await rm(config.mockDataFile, { force: true });
const store = new MockStore(config.mockDataFile);

const day = 24 * 60 * 60 * 1000;
const base = Date.now();
const samples: [number, Parameters<MockStore["create"]>[0], { status?: "検討中" | "実施中" | "完了" | "見送り"; owner?: string; response?: string }][] = [
  [30, { kind: "困りごと", area: "第1ライン", title: "工具棚が遠くて往復が多い", detail: "1 回 40 秒、1 日 20 往復", reporter: "佐藤" }, { status: "完了", owner: "山田", response: "棚を作業台横へ移設" }],
  [25, { kind: "改善提案", area: "倉庫", title: "受入検査票を QR で読み取りたい", reporter: "鈴木" }, { status: "実施中", owner: "山田", response: "kintone 側フォーム作成中" }],
  [20, { kind: "困りごと", area: "第2ライン", title: "夜勤の照明が暗い", detail: "検査工程で見落としが心配", reporter: "" }, { status: "検討中", owner: "田中" }],
  [14, { kind: "改善提案", area: "事務所", title: "日報の転記を自動化", reporter: "高橋" }, { status: "見送り", owner: "田中", response: "来期のシステム更新で対応予定" }],
  [7, { kind: "困りごと", area: "第1ライン", title: "台車のキャスターが引っかかる", reporter: "伊藤" }, {}],
  [3, { kind: "改善提案", area: "第2ライン", title: "段取り替え手順の写真掲示", reporter: "渡辺" }, {}],
  [1, { kind: "困りごと", area: "その他", title: "更衣室のロッカーが足りない", reporter: "" }, {}],
];

for (const [daysAgo, input, patch] of samples) {
  const at = new Date(base - daysAgo * day);
  const p = await store.create(input, at);
  if (Object.keys(patch).length) await store.update(p.id, patch, new Date(at.getTime() + 2 * day));
}
console.log(`seed 完了: ${samples.length} 件 → ${config.mockDataFile}`);
