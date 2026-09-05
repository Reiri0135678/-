import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema'
import { requestCardMigrations, requestCardProps } from './request-card'

/** サーバー側で同期ルームに渡すスキーマ。クライアントの shapeUtils と一致させること */
export function createQcSchema() {
  return createTLSchema({
    shapes: {
      ...defaultShapeSchemas,
      'request-card': { props: requestCardProps, migrations: requestCardMigrations }
    },
    bindings: defaultBindingSchemas
  })
}
