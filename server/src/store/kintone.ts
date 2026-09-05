import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import {
  AREAS,
  FIELD,
  INITIAL_STATUS,
  KINDS,
  STATUSES,
  type Area,
  type CreatePostInput,
  type Kind,
  type Post,
  type PostFilter,
  type Status,
  type UpdatePostInput,
} from "@kaizen/shared";
import { applyPatch, toKintoneDateTime } from "./apply.js";
import { StoreError, type PostStore } from "./types.js";

type KRecord = Record<string, { value: unknown }>;

function str(rec: KRecord, code: string): string {
  const v = rec[code]?.value;
  return typeof v === "string" ? v : "";
}

function toPost(rec: KRecord): Post {
  return {
    id: str(rec, FIELD.id),
    title: str(rec, FIELD.title),
    kind: str(rec, FIELD.kind) as Kind,
    area: str(rec, FIELD.area) as Area,
    detail: str(rec, FIELD.detail),
    reporter: str(rec, FIELD.reporter),
    status: (str(rec, FIELD.status) || INITIAL_STATUS) as Status,
    owner: str(rec, FIELD.owner),
    response: str(rec, FIELD.response),
    postedAt: str(rec, FIELD.postedAt),
    completedAt: str(rec, FIELD.completedAt) || null,
  };
}

function q(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildQuery(filter: PostFilter): string {
  const cond: string[] = [];
  if (filter.status) cond.push(`${FIELD.status} in (${q(filter.status)})`);
  if (filter.area) cond.push(`${FIELD.area} in (${q(filter.area)})`);
  if (filter.kind) cond.push(`${FIELD.kind} in (${q(filter.kind)})`);
  return cond.join(" and ");
}

export interface KintoneStoreOptions {
  baseUrl: string;
  appId: string;
  apiToken: string;
}

export class KintoneStore implements PostStore {
  private readonly client: KintoneRestAPIClient;
  private readonly app: string;

  constructor(opts: KintoneStoreOptions) {
    this.client = new KintoneRestAPIClient({
      baseUrl: opts.baseUrl,
      auth: { apiToken: opts.apiToken },
    });
    this.app = opts.appId;
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new StoreError("UPSTREAM", `kintone との通信に失敗しました: ${msg}`);
    }
  }

  async list(filter: PostFilter = {}): Promise<Post[]> {
    return this.guard(async () => {
      const records = (await this.client.record.getAllRecords({
        app: this.app,
        condition: buildQuery(filter),
        orderBy: `${FIELD.postedAt} desc, ${FIELD.id} desc`,
      })) as KRecord[];
      return records.map(toPost);
    });
  }

  async get(id: string): Promise<Post | null> {
    return this.guard(async () => {
      const { records } = await this.client.record.getRecords({
        app: this.app,
        query: `${FIELD.id} = ${Number(id)}`,
      });
      const rec = records[0] as KRecord | undefined;
      return rec ? toPost(rec) : null;
    });
  }

  async create(input: CreatePostInput, now: Date): Promise<Post> {
    return this.guard(async () => {
      const record = {
        [FIELD.title]: { value: input.title },
        [FIELD.kind]: { value: input.kind },
        [FIELD.area]: { value: input.area },
        [FIELD.detail]: { value: input.detail ?? "" },
        [FIELD.reporter]: { value: input.reporter ?? "" },
        [FIELD.status]: { value: INITIAL_STATUS },
        [FIELD.postedAt]: { value: toKintoneDateTime(now) },
      };
      const { id } = await this.client.record.addRecord({ app: this.app, record });
      const created = await this.get(id);
      if (!created) throw new Error(`登録直後のレコード ${id} を取得できません`);
      return created;
    });
  }

  async update(id: string, patch: UpdatePostInput, now: Date): Promise<Post | null> {
    const current = await this.get(id);
    if (!current) return null;
    const next = applyPatch(current, patch, now);
    return this.guard(async () => {
      const record: Record<string, { value: string }> = {
        [FIELD.status]: { value: next.status },
        [FIELD.owner]: { value: next.owner },
        [FIELD.response]: { value: next.response },
        [FIELD.completedAt]: { value: next.completedAt ?? "" },
      };
      await this.client.record.updateRecord({ app: this.app, id, record });
      return next;
    });
  }

  /**
   * kintone のドロップダウン選択肢と shared の選択肢を照合し、差分を警告する。
   * API トークンにアプリ管理権限がない場合などは取得に失敗するので、その時はスキップする。
   */
  async verifyOptions(log: (msg: string) => void = console.warn): Promise<void> {
    let properties: Record<string, { type?: string; options?: Record<string, unknown> }>;
    try {
      ({ properties } = await this.client.app.getFormFields({ app: this.app }));
    } catch (e) {
      log(`[kintone] 選択肢の照合をスキップしました（フォーム定義を取得できません）: ${e instanceof Error ? e.message : e}`);
      return;
    }
    const checks: [string, readonly string[]][] = [
      [FIELD.kind, KINDS],
      [FIELD.area, AREAS],
      [FIELD.status, STATUSES],
    ];
    for (const [code, expected] of checks) {
      const prop = properties[code];
      if (!prop) {
        log(`[kintone] フィールド "${code}" がアプリにありません`);
        continue;
      }
      const actual = Object.keys(prop.options ?? {});
      const missing = expected.filter((v) => !actual.includes(v));
      const extra = actual.filter((v) => !expected.includes(v));
      if (missing.length || extra.length) {
        log(`[kintone] "${code}" の選択肢が一致しません。不足: [${missing}] 余分: [${extra}]`);
      }
    }
  }
}
