import { contextBridge } from 'electron'

// 将来: ファイル保存 / kintone連携 の IPC をここに露出する
const api = {
  platform: process.platform,
  demo: process.env['QC_DEMO'] === '1',
  versions: {
    electron: process.versions.electron,
    node: process.versions.node
  }
}

contextBridge.exposeInMainWorld('api', api)
export type Api = typeof api
