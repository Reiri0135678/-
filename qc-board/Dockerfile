# QC Board: クライアントをビルドし、Node 22 でサーバーを動かす 1 コンテナ構成
# ビルド: docker build -t qc-board .
# 実行:   docker run -p 3000:3000 -v qc-data:/data qc-board   (実運用は deploy/docker-compose.yml を使う)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY client ./client
COPY shared ./shared
COPY server ./server
RUN npm run typecheck && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    QC_DATA_DIR=/data \
    QC_USERS_FILE=/data/config/users.json \
    QC_KINTONE_CONFIG=/data/config/kintone.json \
    QC_NOTIFY_CONFIG=/data/config/notify.json \
    QC_BACKUP_DIR=/backups
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY tsconfig.json tsconfig.server.json ./
COPY shared ./shared
COPY server ./server
COPY scripts/add-user.mjs scripts/backup.mjs ./scripts/
COPY config/README.md config/kintone.example.json ./config/
RUN mkdir -p /data /backups && chown -R node:node /app /data /backups
USER node
EXPOSE 3000
VOLUME ["/data", "/backups"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "node_modules/tsx/dist/cli.mjs", "server/src/index.ts"]
