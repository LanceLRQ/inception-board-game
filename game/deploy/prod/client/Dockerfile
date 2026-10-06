# @icgame/client 运行镜像（Vite build → nginx 托管）
#
# 产物：静态 SPA + PWA 资源；由 nginx:alpine 提供服务。
# SPA fallback：所有未命中文件请求回落到 index.html（React Router 友好）。

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# === Stage 1: 安装 workspace 依赖 ===
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/game-engine/package.json packages/game-engine/
COPY packages/bot/package.json packages/bot/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile

# === Stage 2: 构建静态产物 ===
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
# 工作区根配置：包内脚本要靠它找到根目录安装的工具，各包的 tsconfig 也继承自根配置
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/game-engine ./packages/game-engine
COPY packages/bot ./packages/bot
COPY packages/client ./packages/client
# Vite 构建时的运行期 API base（通过构建参数注入）
ARG VITE_API_URL="/api"
ARG VITE_WS_URL="/ws"
ARG VITE_PUBLIC_BASE_URL=""
ENV VITE_API_URL=$VITE_API_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_PUBLIC_BASE_URL=$VITE_PUBLIC_BASE_URL
RUN cd packages/client && pnpm build

# === Stage 3: nginx 托管 ===
FROM nginx:alpine AS runner
COPY --from=build /app/packages/client/dist /usr/share/nginx/html
COPY deploy/prod/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O- http://127.0.0.1/ || exit 1
