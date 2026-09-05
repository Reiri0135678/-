import { describe, expect, it } from "vitest";
import { weekStartOf } from "./stats.js";

describe("weekStartOf", () => {
  it("月曜始まりで週頭を返す", () => {
    expect(weekStartOf("2026-09-05T10:00:00Z")).toBe("2026-08-31"); // 土
    expect(weekStartOf("2026-08-31T00:00:00Z")).toBe("2026-08-31"); // 月
    expect(weekStartOf("2026-09-06T23:59:59Z")).toBe("2026-08-31"); // 日
    expect(weekStartOf("2026-09-07T00:00:00Z")).toBe("2026-09-07"); // 翌月
  });
});
