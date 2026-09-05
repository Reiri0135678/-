import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { MockStore } from "./store/mock.js";

function setup(nowIso = "2026-09-05T01:00:00Z") {
  const store = new MockStore();
  const app = createApp({ store, mode: "mock", now: () => new Date(nowIso) });
  return { app, store };
}

describe("GET /api/health, /api/options", () => {
  it("稼働モードと選択肢を返す", async () => {
    const { app } = setup();
    expect((await request(app).get("/api/health")).body).toEqual({ ok: true, mode: "mock" });
    const opt = (await request(app).get("/api/options")).body;
    expect(opt.kinds).toContain("困りごと");
    expect(opt.statuses[0]).toBe("受付");
  });
});

describe("POST /api/posts", () => {
  it("投稿すると受付・投稿日時付きで 201 を返す", async () => {
    const { app } = setup();
    const res = await request(app)
      .post("/api/posts")
      .send({ kind: "困りごと", area: "倉庫", title: "棚が遠い" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: "1",
      status: "受付",
      postedAt: "2026-09-05T01:00:00Z",
      completedAt: null,
      reporter: "",
    });
  });

  it("検証エラーは 400 と理由一覧", async () => {
    const { app } = setup();
    const res = await request(app).post("/api/posts").send({ kind: "x", area: "倉庫", title: "" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION");
    expect(res.body.error.details).toEqual(["区分が不正です", "タイトルを入力してください"]);
  });

  it("壊れた JSON は 400", async () => {
    const { app } = setup();
    const res = await request(app)
      .post("/api/posts")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_JSON");
  });
});

describe("GET /api/posts", () => {
  it("新しい順に返し、フィルタが効く", async () => {
    const { store, app } = setup();
    await store.create({ kind: "困りごと", area: "倉庫", title: "a" }, new Date("2026-09-01T00:00:00Z"));
    await store.create({ kind: "改善提案", area: "事務所", title: "b" }, new Date("2026-09-03T00:00:00Z"));
    const all = (await request(app).get("/api/posts")).body;
    expect(all.map((p: { title: string }) => p.title)).toEqual(["b", "a"]);
    const office = (await request(app).get("/api/posts?area=事務所")).body;
    expect(office).toHaveLength(1);
    const ignored = (await request(app).get("/api/posts?area=屋上")).body;
    expect(ignored).toHaveLength(2); // 不正な値は無視
  });
});

describe("PATCH /api/posts/:id", () => {
  it("完了にすると completed_at が入り、受付に戻すと消える", async () => {
    const { store, app } = setup();
    await store.create({ kind: "困りごと", area: "倉庫", title: "a" }, new Date("2026-09-01T00:00:00Z"));
    const done = await request(app).patch("/api/posts/1").send({ status: "完了", owner: "山田", response: "移設した" });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: "完了", owner: "山田", completedAt: "2026-09-05T01:00:00Z" });
    const back = await request(app).patch("/api/posts/1").send({ status: "検討中" });
    expect(back.body.completedAt).toBeNull();
    expect(back.body.owner).toBe("山田"); // 他項目は保持
  });

  it("存在しない ID は 404、空更新は 400", async () => {
    const { app } = setup();
    expect((await request(app).patch("/api/posts/99").send({ status: "完了" })).status).toBe(404);
    expect((await request(app).patch("/api/posts/abc").send({ status: "完了" })).status).toBe(400);
    expect((await request(app).patch("/api/posts/1").send({})).status).toBe(400);
  });
});

describe("GET /api/stats", () => {
  it("ステータス別・区分×場所・週次を返す", async () => {
    const { store, app } = setup("2026-09-05T01:00:00Z");
    await store.create({ kind: "困りごと", area: "倉庫", title: "a" }, new Date("2026-09-01T00:00:00Z"));
    await store.create({ kind: "困りごと", area: "倉庫", title: "b" }, new Date("2026-08-25T00:00:00Z"));
    await store.update("2", { status: "完了" }, new Date("2026-08-26T00:00:00Z"));
    const s = (await request(app).get("/api/stats")).body;
    expect(s.total).toBe(2);
    expect(s.byStatus["受付"]).toBe(1);
    expect(s.byStatus["完了"]).toBe(1);
    expect(s.byKindArea["困りごと"]["倉庫"]).toBe(2);
    expect(s.weekly).toHaveLength(8);
    expect(s.weekly.at(-1)).toEqual({ weekStart: "2026-08-31", count: 1 });
    expect(s.weekly.at(-2)).toEqual({ weekStart: "2026-08-24", count: 1 });
  });
});
