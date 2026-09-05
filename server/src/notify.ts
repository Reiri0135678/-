import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { HistoryEntry, RequestCardShape } from '../../shared/shapes'

/**
 * 通知。変更履歴のエントリから「新規依頼」「状態変更」「検査結果」「担当割当」を検出し、
 * Incoming Webhook(Teams / Slack / 汎用 JSON)へ送る。設定が無ければログに出すだけ。
 */
export type NotifyEvent = 'created' | 'status' | 'result' | 'assignee'
export interface NotifyConfig {
  webhookUrl: string
  format?: 'teams' | 'slack' | 'json'
  events?: NotifyEvent[]
  boardUrl?: string
}
export interface Notification {
  event: NotifyEvent
  boardId: string
  boardName: string
  no: string
  title: string
  user: string
  detail: string
  url: string
}

export class Notifier {
  private config: NotifyConfig | null = null
  /** テスト・デモ用: 送った通知を保持 */
  readonly sent: Notification[] = []
  private hook: ((n: Notification) => void) | null = null

  constructor(private readonly configFile: string) {}

  async init(): Promise<void> {
    if (!existsSync(this.configFile)) return
    try {
      const c = JSON.parse(await readFile(this.configFile, 'utf8')) as NotifyConfig
      if (!c.webhookUrl) return
      this.config = { format: 'teams', events: ['created', 'status', 'result', 'assignee'], ...c }
    } catch (err) {
      console.error('[notify] 設定の読込に失敗', err)
    }
  }

  /** 環境変数などから直接設定する(テスト用) */
  configure(c: NotifyConfig | null): void {
    this.config = c ? { format: 'json', events: ['created', 'status', 'result', 'assignee'], ...c } : null
  }
  onSend(fn: ((n: Notification) => void) | null): void {
    this.hook = fn
  }

  status(): { enabled: boolean; format?: string; events?: NotifyEvent[] } {
    return this.config ? { enabled: true, format: this.config.format, events: this.config.events } : { enabled: false }
  }

  /** 履歴エントリから通知イベントを抽出して送る */
  async fromHistory(entries: HistoryEntry[], boardId: string, boardName: string, current: (shapeId: string) => RequestCardShape | null): Promise<void> {
    for (const e of entries) {
      if (e.shapeType !== 'request-card') continue
      let card = current(e.shapeId)
      if (!card) continue
      // 新規作成は採番(非同期)を待ってから通知する
      if (e.action === 'create') {
        for (let i = 0; i < 20 && !card.no; i++) {
          await new Promise((r) => setTimeout(r, 50))
          card = current(e.shapeId) ?? card
        }
      }
      const base = {
        boardId,
        boardName,
        no: card.no || '(採番待ち)',
        title: [card.partNo, card.title].filter(Boolean).join(' '),
        user: e.user,
        url: `${this.config?.boardUrl ?? ''}/b/${encodeURIComponent(boardId)}`
      }
      if (e.action === 'create') {
        await this.send({ ...base, event: 'created', detail: `新規依頼(${card.dept || '部門未設定'} / 依頼者 ${card.requester || e.user}${card.priority === '至急' ? ' / 至急' : ''})` })
        continue
      }
      if (e.action !== 'update') continue
      if ('status' in e.fields) await this.send({ ...base, event: 'status', detail: `状態 → ${String(e.fields['status'])}` })
      if ('result' in e.fields && e.fields['result'] !== '未判定') await this.send({ ...base, event: 'result', detail: `検査結果: ${String(e.fields['result'])}${card.resultNote ? ` (${card.resultNote})` : ''}` })
      if ('assignee' in e.fields && e.fields['assignee']) await this.send({ ...base, event: 'assignee', detail: `担当: ${String(e.fields['assignee'])}` })
    }
  }

  private async send(n: Notification): Promise<void> {
    this.sent.push(n)
    if (this.sent.length > 200) this.sent.shift()
    this.hook?.(n)
    if (!this.config || !this.config.events?.includes(n.event)) {
      if (!this.config) console.log(`[notify] (未設定) ${n.no} ${n.detail} by ${n.user}`)
      return
    }
    const body = this.payload(n)
    try {
      const res = await fetch(this.config.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) console.error(`[notify] webhook ${res.status}`)
    } catch (err) {
      console.error('[notify] webhook failed', err)
    }
  }

  private payload(n: Notification): unknown {
    const text = `【検査依頼 ${n.no}】${n.detail}\n${n.title}(${n.boardName})— ${n.user}`
    switch (this.config?.format) {
      case 'slack':
        return { text: `${text}\n${n.url}` }
      case 'json':
        return n
      case 'teams':
      default:
        return {
          type: 'message',
          attachments: [
            {
              contentType: 'application/vnd.microsoft.card.adaptive',
              content: {
                type: 'AdaptiveCard',
                version: '1.4',
                body: [
                  { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: `検査依頼 ${n.no}` },
                  { type: 'TextBlock', text: n.detail, wrap: true },
                  {
                    type: 'FactSet',
                    facts: [
                      { title: '対象', value: n.title || '-' },
                      { title: 'ボード', value: n.boardName },
                      { title: '操作者', value: n.user }
                    ]
                  }
                ],
                actions: n.url ? [{ type: 'Action.OpenUrl', title: 'ボードを開く', url: n.url }] : []
              }
            }
          ]
        }
    }
  }
}
