// 依存なしで PWA 用 PNG アイコンを生成する（角丸の青い正方形 + 白い 3 本のカード）。
// icon.svg と同じ図柄。実行: node scripts/gen-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public");
mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function render(size, { transparentCorners }) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 64;
  const bg = [0x1f, 0x5f, 0xbf];
  const bars = [
    [12, 16, 12, 32, 0.95],
    [26, 16, 12, 20, 0.8],
    [40, 16, 12, 26, 0.65],
  ];
  const r = 14 * s;
  const inRounded = (x, y, X, Y, W, H, R) => {
    if (x < X || y < Y || x >= X + W || y >= Y + H) return false;
    const cx = Math.min(Math.max(x, X + R), X + W - R);
    const cy = Math.min(Math.max(y, Y + R), Y + H - R);
    return (x - cx) ** 2 + (y - cy) ** 2 <= R * R;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = x + 0.5, cy = y + 0.5;
      const inside = transparentCorners ? inRounded(cx, cy, 0, 0, size, size, r) : true;
      if (!inside) { px[i + 3] = 0; continue; }
      let [R, G, B] = bg;
      for (const [bx, by, bw, bh, a] of bars) {
        if (inRounded(cx, cy, bx * s, by * s, bw * s, bh * s, 3 * s)) {
          R = Math.round(R + (255 - R) * a);
          G = Math.round(G + (255 - G) * a);
          B = Math.round(B + (255 - B) * a);
        }
      }
      px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = 255;
    }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// maskable 兼用の 512 は角を透過させない（セーフゾーンを OS 側が切る）
writeFileSync(join(outDir, "pwa-192.png"), render(192, { transparentCorners: true }));
writeFileSync(join(outDir, "pwa-512.png"), render(512, { transparentCorners: false }));
writeFileSync(join(outDir, "apple-touch-icon.png"), render(180, { transparentCorners: false }));
console.log("icons generated in", outDir);
