import type { CreatePostInput, Post, PostFilter, UpdatePostInput } from "@kaizen/shared";

export interface PostStore {
  list(filter?: PostFilter): Promise<Post[]>;
  get(id: string): Promise<Post | null>;
  create(input: CreatePostInput, now: Date): Promise<Post>;
  /** 存在しなければ null */
  update(id: string, patch: UpdatePostInput, now: Date): Promise<Post | null>;
}

export class StoreError extends Error {
  constructor(
    public readonly code: "UPSTREAM" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}
