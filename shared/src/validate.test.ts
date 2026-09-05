import { describe, expect, it } from "vitest";
import { validateCreatePost, validateUpdatePost } from "./validate.js";

describe("validateCreatePost", () => {
  it("必須 3 項目が揃えば通り、任意項目は空文字で埋める", () => {
    const r = validateCreatePost({ kind: "困りごと", area: "倉庫", title: "  棚が遠い  " });
    expect(r).toEqual({
      ok: true,
      value: { kind: "困りごと", area: "倉庫", title: "棚が遠い", detail: "", reporter: "" },
    });
  });

  it("区分・場所が選択肢外なら拒否する", () => {
    const r = validateCreatePost({ kind: "要望", area: "屋上", title: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toEqual(["区分が不正です", "場所が不正です"]);
  });

  it("タイトル空・長すぎは拒否する", () => {
    expect(validateCreatePost({ kind: "改善提案", area: "事務所", title: "   " }).ok).toBe(false);
    expect(
      validateCreatePost({ kind: "改善提案", area: "事務所", title: "あ".repeat(61) }).ok,
    ).toBe(false);
    expect(
      validateCreatePost({ kind: "改善提案", area: "事務所", title: "あ".repeat(60) }).ok,
    ).toBe(true);
  });

  it("本文がオブジェクトでなければ拒否する", () => {
    expect(validateCreatePost(null).ok).toBe(false);
    expect(validateCreatePost("x").ok).toBe(false);
  });
});

describe("validateUpdatePost", () => {
  it("ステータスと担当者を受け付ける", () => {
    const r = validateUpdatePost({ status: "検討中", owner: " 山田 " });
    expect(r).toEqual({ ok: true, value: { status: "検討中", owner: "山田" } });
  });

  it("空の更新は拒否する", () => {
    const r = validateUpdatePost({});
    expect(r.ok).toBe(false);
  });

  it("不正なステータスは拒否する", () => {
    expect(validateUpdatePost({ status: "保留" }).ok).toBe(false);
  });
});
