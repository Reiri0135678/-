import type { TLAssetStore } from 'tldraw'

/** 画像などはサーバーの /api/uploads に置き、全員が同じ URL で参照する */
export const qcAssetStore: TLAssetStore = {
  async upload(asset, file) {
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
    const id = `${asset.id.replace(/^asset:/, '')}${ext}`.replace(/[^A-Za-z0-9_.-]/g, '_')
    const r = await fetch(`/api/uploads/${id}`, { method: 'PUT', body: file })
    if (!r.ok) throw new Error(`upload failed: ${r.status}`)
    return { src: `/api/uploads/${id}` }
  },
  resolve(asset) {
    return asset.props.src
  }
}
