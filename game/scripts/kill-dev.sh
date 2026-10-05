#!/usr/bin/env bash
# 清理 dev server 残留 node 进程
#
# 背景：pnpm 是 sh wrapper，kill pnpm pid 只杀 wrapper，vite/tsx 等孙子进程
# 会被 init 收养并继续占用端口。本脚本按端口 + 项目路径双保险清理。
#
# 使用：pnpm kill:dev
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# 只列本项目开发服务用到的端口；不要加 80 / 8080 这类常被本机其他服务占用的端口
PORTS=(3000 3001 3002 3100 3101 4173 4174 5173 5174)

killed=0

# 1) 按端口杀（最直接）
for port in "${PORTS[@]}"; do
  pids=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "[kill:dev] 端口 $port 被占用，PID=$pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    killed=1
  fi
done

# 2) 按项目路径兜底（vite / tsx watch / vitest --watch 残留）
stale=""
for pid in $(pgrep -f "$ROOT" 2>/dev/null | grep -vE "^$$\$|^$PPID\$" || true); do
  # 命令行里带项目路径的不一定是开发服务：镜像构建、容器编排、编辑器都会带，跳过它们
  cmd=$(ps -o command= -p "$pid" 2>/dev/null || true)
  case "$cmd" in
    *docker*|*buildx*|*compose*) continue;;
  esac
  case "$cmd" in
    *node*|*vite*|*tsx*|*vitest*|*turbo*|*pnpm*|*esbuild*) stale="$stale $pid";;
  esac
done
if [ -n "$stale" ]; then
  echo "[kill:dev] 发现项目路径内残留进程："
  # shellcheck disable=SC2086
  ps -o pid,command -p $stale 2>/dev/null | tail -n +2 || true
  # shellcheck disable=SC2086
  kill $stale 2>/dev/null || true
  killed=1
fi

# 3) 等 2 秒让优雅退出，再 -9 兜底
if [ "$killed" = "1" ]; then
  sleep 2
  for port in "${PORTS[@]}"; do
    pids=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null || true)
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  done
  echo "[kill:dev] ✅ 清理完成"
else
  echo "[kill:dev] ✅ 无残留进程"
fi
