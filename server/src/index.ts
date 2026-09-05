import { loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { KintoneStore } from "./store/kintone.js";
import { MockStore } from "./store/mock.js";
import type { PostStore } from "./store/types.js";

const config = loadConfig();

let store: PostStore;
if (config.mode === "kintone" && config.kintone) {
  const ks = new KintoneStore(config.kintone);
  await ks.verifyOptions();
  store = ks;
} else {
  store = new MockStore(config.mockDataFile);
  console.log(`[mock] 保存先: ${config.mockDataFile}`);
}

const staticDir = new URL("../../web/dist", import.meta.url).pathname;
const app = createApp({ store, mode: config.mode, staticDir });

app.listen(config.port, () => {
  console.log(`Kaizen Board BFF: http://localhost:${config.port}  (mode=${config.mode})`);
});
