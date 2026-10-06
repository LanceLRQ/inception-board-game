# @icgame/server 运行镜像（MVP 版本）
#
# 策略（MVP）：直接用 tsx 运行 TypeScript 源码；以后再切到 tsc 编译流水线。
# 多阶段：deps（仅 workspace 元信息，最大化 Docker cache） → runtime（源码 + node_modules）。

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# === Stage 1: 依赖层（仅 package.json 变化时才重跑） ===
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/game-engine/package.json packages/game-engine/
COPY packages/bot/package.json packages/bot/
COPY packages/server/package.json packages/server/
# client 不需要，但 workspace 要求完整元信息
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile --prod=false

# === Stage 2: 源码 + Prisma client 生成 ===
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
# 工作区根配置：包内脚本要靠它找到根目录安装的工具，各包的 tsconfig 也继承自根配置
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/game-engine ./packages/game-engine
COPY packages/bot ./packages/bot
COPY packages/server ./packages/server
# 生成 Prisma client（输出到 packages/server/src/generated/prisma）
RUN cd packages/server && pnpm prisma generate

# === Stage 3: 运行时 ===
FROM base AS runner
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    PORT=3001
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/.npmrc /app/tsconfig.base.json ./
EXPOSE 3001
# 健康检查端点由 Koa /health 暴露（app.ts）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:3001/health || exit 1
# 用 tsx 运行 TS 源（MVP）
WORKDIR /app/packages/server
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
