#!/usr/bin/env bash
# 私有部署 Dry Run
# 对照：plans/tasks.md W9 · 私有部署 Dry Run（空白 VPS 3 分钟跑起首屏）
#
# 用法：
#   bash scripts/deploy-dry-run.sh           # 默认：build + up + probe + down
#   bash scripts/deploy-dry-run.sh --keep    # 探活后保留容器不 down
#   bash scripts/deploy-dry-run.sh --timeout 180  # 自定义探活超时（秒）
#
# 目的：
#   - 在本机 Docker Desktop 或 CI 环境执行，验证 docker/docker-compose.yml 可一把起
#   - 逐项探活：postgres pg_isready / redis PING / api /health / client /
#   - 任一探活失败 → exit 1 并 dump 日志
#
# 不在此脚本做的事：
#   - 不做 UI 交互测试（留给 e2e playwright）
#   - 不做性能/负载测试（留给 k6）

set -euo pipefail

# --- 参数解析 ---
KEEP=0
TIMEOUT_SEC=180
ENV_FILE=".env.dry-run"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --timeout) TIMEOUT_SEC="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    *) echo "[deploy-dry-run] 未知参数: $1"; exit 2 ;;
  esac
done

# --- 路径 ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_GAME_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_GAME_DIR/docker/docker-compose.yml"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "[deploy-dry-run] 找不到 $COMPOSE_FILE"
  exit 1
fi

cd "$REPO_GAME_DIR"

# --- 生成临时 .env（JWT_SECRET 随机） ---
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[deploy-dry-run] 生成临时 $ENV_FILE"
  RAND_JWT="$(head -c 48 /dev/urandom | base64 2>/dev/null | tr -d '\n' || echo "dry-run-$(date +%s)")"
  cat > "$ENV_FILE" <<EOF
CLIENT_PORT=8080
API_PORT=3001
POSTGRES_PORT=5432
REDIS_PORT=6379
POSTGRES_DB=icgame
POSTGRES_USER=icgame
POSTGRES_PASSWORD=dryrun_pass_$(date +%s)
JWT_SECRET=$RAND_JWT
JWT_EXPIRES_IN=1d
WS_CORS_ORIGIN=*
WS_PATH=/ws
LOG_LEVEL=info
VITE_API_BASE=/api
VITE_WS_URL=/ws
EOF
fi

DC() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

# --- 清理钩子 ---
cleanup() {
  local exit_code=$?
  if [[ "$KEEP" == "1" ]]; then
    echo ""
    echo "[deploy-dry-run] --keep 已指定，容器保留运行"
    echo "  停止：DC down -v"
    exit $exit_code
  fi
  echo ""
  echo "[deploy-dry-run] 清理容器 + 卷..."
  DC down -v >/dev/null 2>&1 || true
  exit $exit_code
}
trap cleanup EXIT INT TERM

# --- Step 1: build ---
echo "=== [1/4] docker compose build ==="
DC build --quiet

# --- Step 2: up ---
echo "=== [2/4] docker compose up -d ==="
DC up -d

# --- Step 3: probes ---
echo "=== [3/4] 逐项探活（最长 ${TIMEOUT_SEC}s） ==="

probe_with_timeout() {
  local label="$1"
  local cmd="$2"
  local deadline=$((SECONDS + TIMEOUT_SEC))
  while (( SECONDS < deadline )); do
    if eval "$cmd" >/dev/null 2>&1; then
      echo "  ✅ $label"
      return 0
    fi
    sleep 2
  done
  echo "  ❌ $label 超时"
  return 1
}

probe_with_timeout "postgres pg_isready" "DC exec -T postgres pg_isready -U icgame"
probe_with_timeout "redis PING" "DC exec -T redis redis-cli ping | grep -q PONG"
# 端口由 .env 指定，默认 3001 / 8080
API_PORT_VAL="$(grep -E '^API_PORT=' "$ENV_FILE" | cut -d= -f2 || echo 3001)"
CLIENT_PORT_VAL="$(grep -E '^CLIENT_PORT=' "$ENV_FILE" | cut -d= -f2 || echo 8080)"
probe_with_timeout "api /health" "curl -fsS http://127.0.0.1:${API_PORT_VAL}/health"
probe_with_timeout "api /ready" "curl -fsS http://127.0.0.1:${API_PORT_VAL}/ready"
probe_with_timeout "client /" "curl -fsS http://127.0.0.1:${CLIENT_PORT_VAL}/"

# --- Step 4: report ---
echo ""
echo "=== [4/4] 报告 ==="
DC ps
echo ""
echo "✅ Dry Run 全部通过！"
echo "   API:    http://127.0.0.1:${API_PORT_VAL}"
echo "   Client: http://127.0.0.1:${CLIENT_PORT_VAL}"
