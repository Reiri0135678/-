import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema'
import { requestCardProps } from './request-card'

/** サーバー側で同期ルームに渡すスキーマ。クライアントの shapeUtils と一致させること */
export function createQcSchema() {
  return createTLSchema({
    shapes: {
      ...defaultShapeSchemas,
      'request-card': { props: requestCardProps }
    },
    bindings: defaultBindingSchemas
  })
}
