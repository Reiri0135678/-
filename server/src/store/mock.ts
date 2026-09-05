import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { INITIAL_STATUS, type CreatePostInput, type Post, type PostFilter, type UpdatePostInput } from "@kaizen/shared";
import { applyPatch, matchesFilter, toKintoneDateTime } from "./apply.js";
import type { PostStore } from "./types.js";

/**
 * kintone なしで動くストア。JSON ファイルに保存する。
 * filePath を省略するとメモリのみ（テスト用）。
 */
export class MockStore implements PostStore {
  private posts: Post[] = [];
  private nextId = 1;
  private loaded = false;

  constructor(private readonly filePath?: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.filePath) return;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const data = JSON.parse(raw) as { nextId: number; posts: Post[] };
      this.posts = data.posts ?? [];
      this.nextId = data.nextId ?? this.posts.length + 1;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }

  private async persist(): Promise<void> {
    if (!this.filePath) return;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      JSON.stringify({ nextId: this.nextId, posts: this.posts }, null, 2),
      "utf8",
    );
  }

  async list(filter: PostFilter = {}): Promise<Post[]> {
    await this.ensureLoaded();
    return this.posts
      .filter((p) => matchesFilter(p, filter))
      .sort((a, b) => (a.postedAt < b.postedAt ? 1 : a.postedAt > b.postedAt ? -1 : Number(b.id) - Number(a.id)));
  }

  async get(id: string): Promise<Post | null> {
    await this.ensureLoaded();
    return this.posts.find((p) => p.id === id) ?? null;
  }

  async create(input: CreatePostInput, now: Date): Promise<Post> {
    await this.ensureLoaded();
    const post: Post = {
      id: String(this.nextId++),
      title: input.title,
      kind: input.kind,
      area: input.area,
      detail: input.detail ?? "",
      reporter: input.reporter ?? "",
      status: INITIAL_STATUS,
      owner: "",
      response: "",
      postedAt: toKintoneDateTime(now),
      completedAt: null,
    };
    this.posts.push(post);
    await this.persist();
    return post;
  }

  async update(id: string, patch: UpdatePostInput, now: Date): Promise<Post | null> {
    await this.ensureLoaded();
    const idx = this.posts.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const next = applyPatch(this.posts[idx]!, patch, now);
    this.posts[idx] = next;
    await this.persist();
    return next;
  }
}
