#!/bin/bash
# 盗梦都市 · 开发环境管理脚本（交互菜单 + 命令行两种入口）
# 开发用的 Postgres / Redis 跑在容器里，服务端与前端在宿主机用 pnpm 运行。
# 用法见 ./scripts/dev.sh help

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="$PROJECT_ROOT/.env"
COMPOSE_FILE="$PROJECT_ROOT/deploy/dev/docker-compose.dev.yml"
COMPOSE_NAME="icg-dev"

# ============================================
# 环境变量加载
# ============================================
# 服务端运行时不读 .env 文件，靠进程环境变量，所以这里把 .env 导出给 pnpm dev 启动的进程。
# 逐行解析 KEY=VALUE，不经过 shell 求值；空值跳过（避免 JWT_SECRET= 这类空串盖掉代码里的开发默认值）。
load_env_file() {
  [ -f "$ENV_FILE" ] || return 0
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      ''|'#'*) continue;;
      *=*) ;;
      *) continue;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    case "$key" in
      *[!A-Za-z0-9_]*|'') continue;;
    esac
    [ -n "$val" ] || continue
    export "$key=$val"
  done < "$ENV_FILE"
}

load_env_file
# VITE_* 是生产镜像的前端构建参数（同域反代的 /api、/ws）；开发时前端直连 localhost:3001，不能带上它们
unset VITE_API_URL VITE_WS_URL VITE_PUBLIC_BASE_URL

DEV_REDIS_PASSWORD="${DEV_REDIS_PASSWORD:-icgame_dev_only}"

# ============================================
# Docker Compose 命令检测
# ============================================
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose)
  echo "[!] 检测到旧版 docker-compose（兼容模式），建议升级到 docker compose 插件" >&2
else
  DOCKER_COMPOSE=()
fi

compose_cmd() {
  if [ ${#DOCKER_COMPOSE[@]} -eq 0 ]; then
    echo "[X] 未找到 docker compose 或 docker-compose，请先安装 Docker Compose" >&2
    return 1
  fi
  if [ -f "$ENV_FILE" ]; then
    "${DOCKER_COMPOSE[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$COMPOSE_NAME" "$@"
  else
    "${DOCKER_COMPOSE[@]}" -f "$COMPOSE_FILE" -p "$COMPOSE_NAME" "$@"
  fi
}

# ============================================
# 颜色定义
# ============================================
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_DIM="\033[2m"
C_CYAN="\033[36m"
C_GREEN="\033[32m"
C_YELLOW="\033[33m"
C_RED="\033[31m"
C_MAGENTA="\033[35m"
C_BLUE="\033[34m"
C_WHITE="\033[97m"

# ============================================
# TUI 辅助函数
# ============================================
print_header() {
  clear
  echo ""
  echo -e "  ${C_CYAN}${C_BOLD}╔══════════════════════════════════════════════╗${C_RESET}"
  echo -e "  ${C_CYAN}${C_BOLD}║${C_RESET}    ${C_WHITE}${C_BOLD}盗梦都市 — 开发环境管理工具${C_RESET}            ${C_CYAN}${C_BOLD}║${C_RESET}"
  echo -e "  ${C_CYAN}${C_BOLD}╚══════════════════════════════════════════════╝${C_RESET}"
  echo ""
}

print_title() {
  echo -e "  ${C_MAGENTA}${C_BOLD}▎${C_RESET} ${C_WHITE}${C_BOLD}$1${C_RESET}"
  echo -e "  ${C_DIM}─────────────────────────────────────────────${C_RESET}"
}

container_status() {
  local name="$1"
  local state
  state=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null || true)
  case "$state" in
    running)  echo -e "${C_GREEN}运行中${C_RESET}";;
    exited)   echo -e "${C_RED}已停止${C_RESET}";;
    paused)   echo -e "${C_YELLOW}已暂停${C_RESET}";;
    *)        echo -e "${C_DIM}未运行${C_RESET}";;
  esac
}

print_dev_status() {
  echo -e "  ${C_DIM}Postgres:${C_RESET} $(container_status icg-dev-postgres)  ${C_DIM}Redis:${C_RESET} $(container_status icg-dev-redis)"
}

print_menu_item() {
  local num="$1"
  local label="$2"
  local desc="$3"
  if [ -n "$desc" ]; then
    echo -e "  ${C_YELLOW}${C_BOLD}[$num]${C_RESET}  $label  ${C_DIM}$desc${C_RESET}"
  else
    echo -e "  ${C_YELLOW}${C_BOLD}[$num]${C_RESET}  $label"
  fi
}

print_back() {
  echo ""
  echo -e "  ${C_DIM}[0]  ← 返回上一级${C_RESET}"
}

print_exit() {
  echo ""
  echo -e "  ${C_DIM}[0]  ← 退出${C_RESET}"
}

prompt_input() {
  local label="$1"
  local default="$2"
  local result
  if [ -n "$default" ]; then
    echo -ne "  ${C_GREEN}?${C_RESET} $label ${C_DIM}(默认: $default)${C_RESET}: " >&2
    read -r result
    echo "${result:-$default}"
  else
    echo -ne "  ${C_GREEN}?${C_RESET} $label: " >&2
    read -r result
    echo "$result"
  fi
}

prompt_choice() {
  local choice
  echo -ne "  ${C_CYAN}>${C_RESET} 请选择: " >&2
  read -r choice
  echo "$choice"
}

print_running() {
  echo ""
  echo -e "  ${C_BLUE}▶${C_RESET} ${C_BOLD}$1${C_RESET}"
  echo ""
}

print_success() {
  echo ""
  echo -e "  ${C_GREEN}✔${C_RESET} $1"
}

print_error() {
  echo ""
  echo -e "  ${C_RED}✘${C_RESET} $1"
}

pause_and_return() {
  echo ""
  echo -ne "  ${C_DIM}按回车键继续...${C_RESET}"
  read -r
}

# ============================================
# 数据库 / Redis 工具
# ============================================
run_psql() {
  compose_cmd exec postgres psql -U icgame -d icgame "$@"
}

run_redis_cli() {
  compose_cmd exec redis redis-cli -a "$DEV_REDIS_PASSWORD" --no-auth-warning "$@"
}

# 清空开发库需要明确确认：直接传 --yes 跳过，否则要求输入 yes
redis_flush() {
  if [ "$1" != "--yes" ]; then
    local answer
    echo -ne "  ${C_RED}!${C_RESET} 将清空开发 Redis 当前库（含进行中的对局），输入 yes 确认: " >&2
    read -r answer
    if [ "$answer" != "yes" ]; then
      echo "[*] 已取消"
      return 0
    fi
  fi
  run_redis_cli FLUSHDB
}

# 按键前缀列出键；本项目的键都以 ico: 开头（例 ico:match:、ico:room:）
redis_scan() {
  local pattern="${1:-ico:*}"
  case "$pattern" in
    *'*'*) ;;
    *) pattern="${pattern}*";;
  esac
  run_redis_cli --scan --pattern "$pattern"
}

# ============================================
# 应用开发（宿主机）
# ============================================
run_pnpm() {
  (cd "$PROJECT_ROOT" && pnpm "$@")
}

run_server_prisma() {
  (cd "$PROJECT_ROOT" && pnpm --filter @icgame/server exec prisma "$@")
}

# ============================================
# 菜单: Docker Compose
# ============================================
menu_compose() {
  while true; do
    print_header
    print_title "开发环境 - Docker Compose"
    echo ""
    print_menu_item 1 "启动容器" "start / up"
    print_menu_item 2 "停止容器" "stop / down"
    print_menu_item 3 "重启容器" "restart"
    print_menu_item 4 "查看状态" "ps"
    print_menu_item 5 "查看日志" "logs"
    print_back

    local choice
    choice=$(prompt_choice)

    case "$choice" in
      1) print_running "docker compose up -d"; compose_cmd up -d || true; pause_and_return;;
      2) print_running "docker compose down"; compose_cmd down || true; pause_and_return;;
      3)
        local service
        service=$(prompt_input "指定服务（postgres / redis，留空重启全部）" "")
        print_running "重启 ${service:-全部}"
        { compose_cmd stop $service && compose_cmd up -d $service; } || true
        pause_and_return;;
      4) print_running "docker compose ps"; compose_cmd ps || true; pause_and_return;;
      5)
        local services extra
        services=$(prompt_input "指定服务（留空查看全部）" "")
        extra=$(prompt_input "附加参数" "-f --tail=100")
        print_running "docker compose logs $extra $services"
        compose_cmd logs $extra $services || true
        pause_and_return;;
      0) return;;
      *) ;;
    esac
  done
}

# ============================================
# 菜单: 数据库
# ============================================
menu_database() {
  while true; do
    print_header
    print_title "数据库（Postgres + Prisma）"
    echo ""
    print_menu_item 1 "进入 psql" "psql"
    print_menu_item 2 "开发迁移" "prisma migrate dev（会按 schema 生成新迁移）"
    print_menu_item 3 "应用迁移" "prisma migrate deploy（只应用已有迁移）"
    print_menu_item 4 "生成客户端" "prisma generate"
    print_back

    local choice
    choice=$(prompt_choice)

    case "$choice" in
      1) print_running "psql"; run_psql || true; pause_and_return;;
      2) print_running "prisma migrate dev"; run_server_prisma migrate dev || true; pause_and_return;;
      3) print_running "prisma migrate deploy"; run_server_prisma migrate deploy || true; pause_and_return;;
      4) print_running "prisma generate"; run_server_prisma generate || true; pause_and_return;;
      0) return;;
      *) ;;
    esac
  done
}

# ============================================
# 菜单: Redis
# ============================================
menu_redis() {
  while true; do
    print_header
    print_title "Redis 工具"
    echo ""
    print_menu_item 1 "进入 redis-cli" "自动带密码"
    print_menu_item 2 "服务器信息" "INFO"
    print_menu_item 3 "按前缀列出键" "SCAN（本项目键前缀 ico:）"
    print_menu_item 4 "清空当前库" "FLUSHDB（需要确认）"
    print_back

    local choice
    choice=$(prompt_choice)

    case "$choice" in
      1)
        print_running "redis-cli"
        run_redis_cli || true
        pause_and_return;;
      2) print_running "redis INFO"; run_redis_cli INFO || true; pause_and_return;;
      3)
        local pattern
        pattern=$(prompt_input "键前缀或通配" "ico:*")
        print_running "SCAN $pattern"
        redis_scan "$pattern" || true
        pause_and_return;;
      4) print_running "FLUSHDB"; redis_flush || true; pause_and_return;;
      0) return;;
      *) ;;
    esac
  done
}

# ============================================
# 菜单: 应用开发
# ============================================
menu_app() {
  while true; do
    print_header
    print_title "应用开发（宿主机 pnpm）"
    echo ""
    print_menu_item 1 "启动开发服务" "pnpm dev（服务端 + 客户端）"
    print_menu_item 2 "运行测试" "pnpm test"
    print_menu_item 3 "构建" "pnpm build"
    print_menu_item 4 "安装依赖" "pnpm install"
    print_menu_item 5 "联机端到端" "pnpm --filter @icgame/e2e test:online"
    print_back

    local choice
    choice=$(prompt_choice)

    case "$choice" in
      1) print_running "pnpm dev"; run_pnpm dev || true; pause_and_return;;
      2) print_running "pnpm test"; run_pnpm test || true; pause_and_return;;
      3) print_running "pnpm build"; run_pnpm build || true; pause_and_return;;
      4) print_running "pnpm install"; run_pnpm install || true; pause_and_return;;
      5) print_running "联机端到端"; run_pnpm --filter @icgame/e2e test:online || true; pause_and_return;;
      0) return;;
      *) ;;
    esac
  done
}

# ============================================
# 主菜单
# ============================================
menu_main() {
  while true; do
    print_header
    print_title "主菜单"
    echo ""
    print_dev_status
    echo ""
    print_menu_item 1 "Docker Compose" "开发用 Postgres / Redis 的启停"
    print_menu_item 2 "数据库" "psql、迁移、生成客户端"
    print_menu_item 3 "Redis 工具" "redis-cli、INFO、SCAN、FLUSHDB"
    print_menu_item 4 "应用开发" "pnpm dev / test / build / install / 联机端到端"
    print_exit

    local choice
    choice=$(prompt_choice)

    case "$choice" in
      1) menu_compose;;
      2) menu_database;;
      3) menu_redis;;
      4) menu_app;;
      0) echo ""; echo -e "  ${C_DIM}Bye~${C_RESET}"; echo ""; exit 0;;
      *) ;;
    esac
  done
}

# ============================================
# CLI 帮助信息
# ============================================
show_help() {
  cat <<EOT
盗梦都市 开发环境管理脚本
=======================================

Usage: ./scripts/dev.sh [command] [options]

  不带参数时进入交互式菜单。

Docker Compose 命令:
  start, up                 启动开发容器（postgres、redis）
  stop, down                停止开发容器
  restart [service]         重启容器
  ps                        查看容器状态
  logs [services...]        查看容器日志
  compose <args...>         透传给 docker compose

数据库命令:
  psql [args...]            进入开发库的 psql
  migrate                   prisma migrate dev
  migrate-deploy            prisma migrate deploy
  generate                  prisma generate

Redis 命令:
  redis-cli [args...]       进入 redis-cli（自动带密码）
  redis-info                Redis INFO
  redis-scan [前缀]         按前缀列出键（默认 ico:*）
  redis-flush [--yes]       清空开发 Redis 当前库（默认要求确认）

应用开发命令:
  dev                       pnpm dev（服务端 + 客户端）
  test                      pnpm test
  build                     pnpm build
  install                   pnpm install
  e2e-online                pnpm --filter @icgame/e2e test:online

Other:
  help, -h, --help          显示本帮助信息

Examples:
  ./scripts/dev.sh                    # 进入交互式菜单
  ./scripts/dev.sh up                 # 启动 Postgres 与 Redis
  ./scripts/dev.sh migrate            # 对开发库做迁移
  ./scripts/dev.sh dev                # 启动服务端与客户端
  ./scripts/dev.sh redis-cli PING     # 执行一次 redis-cli 命令

EOT
}

# ============================================
# 主入口：无参数进入菜单，有参数走 CLI
# ============================================
if [ $# -eq 0 ]; then
  menu_main
  exit 0
fi

cmd="$1"
shift

case "$cmd" in
  "start"|"up")
    compose_cmd up -d "$@";;
  "stop"|"down")
    compose_cmd down "$@";;
  "restart")
    compose_cmd stop "$@"
    compose_cmd up -d "$@";;
  "ps")
    compose_cmd ps;;
  "logs")
    compose_cmd logs "$@";;
  "compose")
    compose_cmd "$@";;
  "psql")
    run_psql "$@";;
  "migrate")
    run_server_prisma migrate dev "$@";;
  "migrate-deploy")
    run_server_prisma migrate deploy "$@";;
  "generate")
    run_server_prisma generate "$@";;
  "redis-cli")
    run_redis_cli "$@";;
  "redis-info")
    run_redis_cli INFO "$@";;
  "redis-scan")
    redis_scan "$@";;
  "redis-flush")
    redis_flush "$@";;
  "dev")
    run_pnpm dev "$@";;
  "test")
    run_pnpm test "$@";;
  "build")
    run_pnpm build "$@";;
  "install")
    run_pnpm install "$@";;
  "e2e-online")
    run_pnpm --filter @icgame/e2e test:online "$@";;
  "help"|"-h"|"--help")
    show_help;;
  *)
    show_help
    exit 1;;
esac
