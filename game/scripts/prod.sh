#!/bin/bash
# 盗梦都市 · 生产环境管理脚本（交互菜单 + 命令行两种入口）
# 用法见 ./scripts/prod.sh help

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="$PROJECT_ROOT/.env"
ENV_EXAMPLE="$PROJECT_ROOT/.env.example"
COMPOSE_FILE="$PROJECT_ROOT/deploy/prod/docker-compose.prod.yml"
COMPOSE_NAME="icg-prod"
INIT_LOCK_FILE="$PROJECT_ROOT/deploy/prod/.init.lock"
API_IMAGE_NAME="icgame-api"
CLIENT_IMAGE_NAME="icgame-client"

# ============================================
# 环境变量加载
# ============================================
# 逐行解析 KEY=VALUE 并导出，不经过 shell 求值；空值跳过（交给 compose 自己读 --env-file）。
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

# 写回 .env 中的某一项：已有同名行就替换，没有就追加（不用 sed -i，避免 macOS / Linux 写法不同）
set_env_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    awk -v k="$key" -v v="$value" 'BEGIN{p=k"="} index($0,p)==1 {print p v; next} {print}' "$ENV_FILE" > "$tmp"
  else
    cat "$ENV_FILE" > "$tmp"
    # 文件末尾没有换行时先补一个，避免新行被接到上一行后面
    if [ -n "$(tail -c1 "$ENV_FILE" 2>/dev/null)" ]; then echo >> "$tmp"; fi
    echo "${key}=${value}" >> "$tmp"
  fi
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

# 读 .env 中的某一项（取最后一次出现）
get_env_value() {
  grep "^$1=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2-
}

# 只含字母数字的随机串：会被拼进连接地址，不能带特殊字符
random_token() {
  LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "${1:-48}"
}

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

# ============================================
# 镜像配置
# ============================================
# 必须 export：compose 是子进程，compose 文件里的 ${IMAGE_NAMESPACE} / ${IMAGE_TAG} 靠它拿值
# （compose 文件自身也写了同名默认值兜底，绕开本脚本直接跑 compose 时同样正确）。
export IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-icgame}"
export IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"

compose_cmd() {
  if [ ${#DOCKER_COMPOSE[@]} -eq 0 ]; then
    echo "[X] 未找到 docker compose 或 docker-compose，请先安装 Docker Compose" >&2
    return 1
  fi
  if [ ! -f "$ENV_FILE" ]; then
    echo "[X] 未找到 ${ENV_FILE}，请先运行 ./scripts/prod.sh init" >&2
    return 1
  fi
  "${DOCKER_COMPOSE[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$COMPOSE_NAME" "$@"
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
  echo -e "  ${C_CYAN}${C_BOLD}║${C_RESET}    ${C_WHITE}${C_BOLD}盗梦都市 — 生产环境管理工具${C_RESET}            ${C_CYAN}${C_BOLD}║${C_RESET}"
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

print_prod_status() {
  echo -e "  ${C_DIM}Postgres:${C_RESET} $(container_status icg-prod-postgres)  ${C_DIM}Redis:${C_RESET} $(container_status icg-prod-redis)  ${C_DIM}Api:${C_RESET} $(container_status icg-prod-api)  ${C_DIM}Client:${C_RESET} $(container_status icg-prod-client)"
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
# 镜像仓库
# ============================================
local_image() {
  echo "${IMAGE_NAMESPACE}/$1:${IMAGE_TAG}"
}

remote_image() {
  echo "${IMAGE_REGISTRY}/${IMAGE_NAMESPACE}/$1"
}

# push / pull / registry-login 都需要先配置仓库地址
require_registry() {
  if [ -z "$IMAGE_REGISTRY" ]; then
    echo "[X] 未配置 IMAGE_REGISTRY：当前镜像只在本机构建使用，不能推送或拉取。" >&2
    echo "    如需使用镜像仓库，请在 .env 中填写 IMAGE_REGISTRY（以及 REGISTRY_USERNAME / REGISTRY_PASSWORD）。" >&2
    return 1
  fi
}

registry_login() {
  require_registry || return 1
  if [ -z "$REGISTRY_USERNAME" ] || [ -z "$REGISTRY_PASSWORD" ]; then
    echo "[X] 登录仓库需要在 .env 中设置 REGISTRY_USERNAME 和 REGISTRY_PASSWORD" >&2
    return 1
  fi
  echo "[*] 登录镜像仓库: ${IMAGE_REGISTRY}"
  echo "$REGISTRY_PASSWORD" | docker login --username "$REGISTRY_USERNAME" --password-stdin "$IMAGE_REGISTRY"
  echo "[OK] 登录成功"
}

# 仓库配了账号就先登录；没配账号（公开仓库）直接继续
login_if_configured() {
  if [ -n "$REGISTRY_USERNAME" ] && [ -n "$REGISTRY_PASSWORD" ]; then
    registry_login
  else
    echo "[*] 未配置 REGISTRY_USERNAME / REGISTRY_PASSWORD，跳过登录"
  fi
}

# 把参数里的 api / client 归一化成镜像名；空参数表示两个都处理
resolve_targets() {
  local t
  if [ $# -eq 0 ]; then
    echo "$API_IMAGE_NAME $CLIENT_IMAGE_NAME"
    return 0
  fi
  for t in "$@"; do
    case "$t" in
      api)    printf '%s ' "$API_IMAGE_NAME";;
      client) printf '%s ' "$CLIENT_IMAGE_NAME";;
      *) echo "[X] 未知目标: ${t}（可选: api、client）" >&2; return 1;;
    esac
  done
  echo
}

# ============================================
# 镜像构建 / 推送 / 拉取
# ============================================
build_images() {
  local targets name
  targets=$(resolve_targets "$@") || return 1
  for name in $targets; do
    echo "[*] 构建镜像: $(local_image "$name")"
    case "$name" in
      "$API_IMAGE_NAME")
        docker build \
          -t "$(local_image "$name")" \
          -f "$PROJECT_ROOT/deploy/prod/api/Dockerfile" \
          "$PROJECT_ROOT";;
      "$CLIENT_IMAGE_NAME")
        # 前端接口地址在构建时写入产物，修改后需要重新构建
        docker build \
          --build-arg "VITE_API_URL=${VITE_API_URL:-/api}" \
          --build-arg "VITE_WS_URL=${VITE_WS_URL:-/ws}" \
          --build-arg "VITE_PUBLIC_BASE_URL=${VITE_PUBLIC_BASE_URL:-}" \
          -t "$(local_image "$name")" \
          -f "$PROJECT_ROOT/deploy/prod/client/Dockerfile" \
          "$PROJECT_ROOT";;
    esac
    echo "[OK] 镜像构建完成: $(local_image "$name")"
  done
}

push_images() {
  require_registry || return 1
  local targets name remote
  targets=$(resolve_targets "$@") || return 1
  login_if_configured
  for name in $targets; do
    remote=$(remote_image "$name")
    echo "[*] 推送镜像: ${remote}:${IMAGE_TAG}"
    docker tag "$(local_image "$name")" "${remote}:${IMAGE_TAG}"
    docker push "${remote}:${IMAGE_TAG}"
    if [ "$IMAGE_TAG" != "latest" ]; then
      docker tag "$(local_image "$name")" "${remote}:latest"
      docker push "${remote}:latest"
    fi
    echo "[OK] 镜像已推送: ${remote}:${IMAGE_TAG}"
  done
}

pull_images() {
  require_registry || return 1
  local targets name remote
  targets=$(resolve_targets "$@") || return 1
  login_if_configured
  for name in $targets; do
    remote=$(remote_image "$name")
    echo "[*] 拉取镜像: ${remote}:${IMAGE_TAG}"
    docker pull "${remote}:${IMAGE_TAG}"
    docker tag "${remote}:${IMAGE_TAG}" "$(local_image "$name")"
    echo "[OK] 镜像已就绪: $(local_image "$name")"
  done
}

# ============================================
# 运行时目录准备
# ============================================
# 数据目录的宿主目录若不存在，Docker 会以 root 自动创建；先建好，保证每次启动前都就绪（幂等）。
ensure_runtime_dirs() {
  mkdir -p "$PROJECT_ROOT/deploy/prod/data/pg-data"
  mkdir -p "$PROJECT_ROOT/deploy/prod/data/redis-data"
}

# 所有启动路径统一走这里
compose_up() {
  ensure_runtime_dirs
  compose_cmd up -d "$@"
}

# ============================================
# 必填密钥
# ============================================
# init 与 secrets 共用同一份清单与生成逻辑：.env 里为空或缺失的才生成，已有值不动
REQUIRED_SECRETS=(JWT_SECRET RECOVERY_CODE_PEPPER POSTGRES_PASSWORD REDIS_PASSWORD)

ensure_secrets() {
  local key current
  for key in "${REQUIRED_SECRETS[@]}"; do
    current=$(get_env_value "$key")
    if [ -z "$current" ]; then
      set_env_value "$key" "$(random_token 48)"
      echo "[*] $key 为空，已生成随机值并写入 .env"
    else
      echo "[OK] $key 已存在，跳过生成"
    fi
  done
  echo "    这些值只保存在 .env 里，请妥善保管，切勿外传或提交进仓库"
}

# 给已初始化过的部署补生成新版本新增的必填密钥；不受初始化锁限制
secrets_prod() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "[X] 未找到 ${ENV_FILE}，请先运行 ./scripts/prod.sh init" >&2
    return 1
  fi
  echo "[*] 检查必填密钥（已有值的不覆盖）..."
  ensure_secrets
}

# ============================================
# 初始化生产环境
# ============================================
init_prod() {
  if [ -f "$INIT_LOCK_FILE" ]; then
    echo "[X] 生产环境已经初始化过了（锁文件: ${INIT_LOCK_FILE}）"
    echo "    如需重新初始化，请先删除该锁文件"
    return 0
  fi

  echo "============================================"
  echo " 盗梦都市 - 生产环境初始化"
  echo "============================================"
  echo ""

  echo "[1/4] 准备目录结构..."
  ensure_runtime_dirs
  echo "[OK] 数据目录已就绪"
  echo ""

  echo "[2/4] 准备 .env..."
  if [ ! -f "$ENV_FILE" ]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "[*] 未找到 .env，已从 .env.example 复制"
  else
    echo "[OK] .env 已存在，保留原有内容"
  fi
  echo ""

  echo "[3/4] 生成必填密钥（已有值的不覆盖）..."
  ensure_secrets
  echo ""

  echo "[4/4] 后续步骤指引"
  echo "============================================"
  echo ""
  echo "接下来请按顺序完成以下步骤："
  echo ""
  echo "1. 按需检查 .env：WS_CORS_ORIGIN（生产改成前端域名）、CLIENT_PORT、IMAGE_* 等"
  echo ""
  echo "2. 构建镜像（首次约需十分钟），或在配置了 IMAGE_REGISTRY 后直接拉取："
  echo "   ./scripts/prod.sh build"
  echo "   或"
  echo "   ./scripts/prod.sh pull"
  echo ""
  echo "3. 启动所有服务："
  echo "   ./scripts/prod.sh start"
  echo ""
  echo "4. 探活："
  echo "   ./scripts/prod.sh health"
  echo ""

  touch "$INIT_LOCK_FILE"
}

# ============================================
# 探活
# ============================================
# 反复尝试直到成功或超时；成功返回 0
probe() {
  local label="$1" timeout="$2"
  shift 2
  local deadline=$((SECONDS + timeout))
  while true; do
    if "$@" >/dev/null 2>&1; then
      echo -e "  ${C_GREEN}✔${C_RESET} $label"
      return 0
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo -e "  ${C_RED}✘${C_RESET} ${label}（超时 ${timeout}s）"
      return 1
    fi
    sleep 2
  done
}

probe_redis() {
  compose_cmd exec -T redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning ping | grep -q PONG
}

probe_postgres() {
  compose_cmd exec -T postgres pg_isready -U "${POSTGRES_USER:-icgame}" -d "${POSTGRES_DB:-icgame}"
}

# 全部通过返回 0，否则返回非零；超时秒数可由第一个参数指定（默认 60）
health_check() {
  local timeout="${1:-60}"
  local api_port="${API_PORT:-3001}" client_port="${CLIENT_PORT:-80}"
  local failed=0

  if ! command -v curl >/dev/null 2>&1; then
    echo "[X] health 需要 curl，请先安装" >&2
    return 1
  fi

  echo "探活（每项最长 ${timeout}s）："
  probe "postgres pg_isready" "$timeout" probe_postgres || failed=$((failed + 1))
  probe "redis PING" "$timeout" probe_redis || failed=$((failed + 1))
  probe "api /health (127.0.0.1:${api_port})" "$timeout" curl -fsS "http://127.0.0.1:${api_port}/health" || failed=$((failed + 1))
  probe "api /ready（数据库连通）" "$timeout" curl -fsS "http://127.0.0.1:${api_port}/ready" || failed=$((failed + 1))
  probe "前端首页 (127.0.0.1:${client_port})" "$timeout" curl -fsS "http://127.0.0.1:${client_port}/" || failed=$((failed + 1))
  probe "经前端端口反代 /api/health" "$timeout" curl -fsS "http://127.0.0.1:${client_port}/api/health" || failed=$((failed + 1))

  echo ""
  if [ "$failed" -eq 0 ]; then
    echo -e "${C_GREEN}全部探活通过${C_RESET}"
    return 0
  fi
  echo -e "${C_RED}${failed} 项探活失败${C_RESET}，可用 ./scripts/prod.sh logs 查看日志" >&2
  return 1
}

# ============================================
# 菜单: Docker Compose
# ============================================
menu_compose() {
  while true; do
    print_header
    print_title "生产环境 - Docker Compose"
    echo ""
    print_menu_item 1 "启动容器" "start / up"
    print_menu_item 2 "停止容器" "stop / down"
    print_menu_item 3 "重启容器" "restart"
    print_menu_item 4 "查看状态" "ps"
    print_menu_item 5 "查看日志" "logs"
    print_menu_item 6 "进入容器" "sh / shell"
    print_menu_item 7 "探活" "health"
    print_back

    local choice
    choice=$(prompt_choice)

    case "$choice" in
      1)
        print_running "docker compose up -d"
        compose_up || true
        pause_and_return;;
      2)
        local opts
        opts=$(prompt_input "附加参数（留空直接停止）" "")
        print_running "docker compose down $opts"
        compose_cmd down $opts || true
        pause_and_return;;
      3)
        local service
        service=$(prompt_input "指定服务（留空重启全部）" "")
        if [ -n "$service" ]; then
          print_running "重启 $service"
          { compose_cmd stop "$service" && compose_up "$service"; } || true
        else
          print_running "重启所有容器"
          { compose_cmd down && compose_up; } || true
        fi
        pause_and_return;;
      4)
        print_running "docker compose ps"
        compose_cmd ps || true
        pause_and_return;;
      5)
        local services
        services=$(prompt_input "指定服务（留空查看全部）" "")
        local extra
        extra=$(prompt_input "附加参数" "-f --tail=100")
        print_running "docker compose logs $extra $services"
        compose_cmd logs $extra $services || true
        pause_and_return;;
      6)
        local service
        service=$(prompt_input "进入哪个容器" "api")
        print_running "sh → $service"
        compose_cmd exec "$service" sh || true
        pause_and_return;;
      7)
        print_running "探活"
        health_check || true
        pause_and_return;;
      0) return;;
      *) ;;
    esac
  done
}

# ============================================
# 菜单: 镜像管理
# ============================================
menu_image() {
  while true; do
    print_header
    print_title "镜像管理"
    echo ""
    echo -e "  ${C_DIM}当前镜像: ${C_WHITE}${IMAGE_NAMESPACE}/*:${IMAGE_TAG}${C_RESET}"
    echo -e "  ${C_DIM}当前仓库: ${C_WHITE}${IMAGE_REGISTRY:-（未配置，仅本机构建）}${C_RESET}"
    echo ""
    print_menu_item 1 "构建镜像" "api / client / 全部"
    print_menu_item 2 "推送镜像" "docker push"
    print_menu_item 3 "拉取镜像" "docker pull"
    print_menu_item 4 "登录仓库" "docker login"
    print_back

    local choice target
    choice=$(prompt_choice)

    case "$choice" in
      1)
        target=$(prompt_input "构建哪个（api / client，留空构建全部）" "")
        print_running "构建镜像"
        build_images $target || true
        pause_and_return;;
      2)
        print_running "推送镜像"
        push_images || true
        pause_and_return;;
      3)
        print_running "拉取镜像"
        pull_images || true
        pause_and_return;;
      4)
        print_running "登录仓库"
        registry_login || true
        pause_and_return;;
      0) return;;
      *) ;;
    esac
  done
}

# ============================================
# 菜单: 日志查看
# ============================================
menu_logs() {
  while true; do
    print_header
    print_title "日志查看"
    echo ""
    print_menu_item 1 "Api 日志" "docker compose logs api"
    print_menu_item 2 "Client 日志" "docker compose logs client"
    print_menu_item 3 "Postgres 日志" "docker compose logs postgres"
    print_menu_item 4 "Redis 日志" "docker compose logs redis"
    print_menu_item 5 "全部日志" "docker compose logs"
    print_back

    local choice
    choice=$(prompt_choice)

    case "$choice" in
      1) print_running "logs → api"; compose_cmd logs -f --tail=100 api || true; pause_and_return;;
      2) print_running "logs → client"; compose_cmd logs -f --tail=100 client || true; pause_and_return;;
      3) print_running "logs → postgres"; compose_cmd logs -f --tail=100 postgres || true; pause_and_return;;
      4) print_running "logs → redis"; compose_cmd logs -f --tail=100 redis || true; pause_and_return;;
      5) print_running "logs → all"; compose_cmd logs -f --tail=100 || true; pause_and_return;;
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
    print_prod_status
    echo ""
    print_menu_item 1 "Docker Compose" "容器启停、状态、Shell、探活"
    print_menu_item 2 "镜像管理" "构建、推送、拉取、登录仓库"
    print_menu_item 3 "初始化生产环境" "init"
    print_menu_item 4 "日志查看" "api / client / postgres / redis / all"
    print_menu_item 5 "补生成缺失密钥" "secrets（更新部署后使用）"
    print_exit

    local choice
    choice=$(prompt_choice)

    case "$choice" in
      1) menu_compose;;
      2) menu_image;;
      3) print_running "初始化生产环境"; init_prod || true; pause_and_return;;
      4) menu_logs;;
      5) print_running "补生成缺失密钥"; secrets_prod || true; pause_and_return;;
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
盗梦都市 生产环境管理脚本
=============================================================

Usage: ./scripts/prod.sh [command] [options]

  不带参数时进入交互式菜单。

初始化:
  init                       初始化生产环境（建数据目录、复制 .env、生成密钥、打印后续指引）
  secrets                    给 .env 里为空或缺失的必填密钥补生成，已有值不动；
                             更新到新版本后若提示缺少密钥就运行它（不受初始化锁限制）

Docker Compose 命令:
  start, up                  启动生产容器（postgres、redis、api、client）
  stop, down                 停止生产容器
  restart [service]          重启容器（指定服务或全部）
  ps                         查看容器状态
  logs [services...]         查看容器日志
  compose <args...>          透传给 docker compose
  health [秒数]              逐项探活，全部通过返回 0（默认每项最长 60 秒）

镜像命令:
  build [api|client]         构建镜像（不带参数构建全部）
  push [api|client]          推送镜像到 IMAGE_REGISTRY
  pull [api|client]          从 IMAGE_REGISTRY 拉取镜像
  registry-login             登录 IMAGE_REGISTRY

Other:
  help, -h, --help           显示本帮助信息

Examples:
  ./scripts/prod.sh                 # 进入交互式菜单
  ./scripts/prod.sh init            # 初始化生产环境
  ./scripts/prod.sh secrets         # 更新部署后补生成新增的必填密钥
  ./scripts/prod.sh build           # 构建 api 与 client 镜像
  ./scripts/prod.sh start           # 启动所有生产容器
  ./scripts/prod.sh health          # 探活

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
  "init")
    init_prod;;
  "secrets")
    secrets_prod;;
  "start"|"up")
    compose_up "$@";;
  "stop"|"down")
    compose_cmd down "$@";;
  "restart")
    if [ $# -eq 0 ]; then
      compose_cmd down
      compose_up
    else
      compose_cmd stop "$1"
      compose_up "$1"
    fi;;
  "ps")
    compose_cmd ps;;
  "logs")
    compose_cmd logs "$@";;
  "build")
    build_images "$@";;
  "push")
    push_images "$@";;
  "pull")
    pull_images "$@";;
  "registry-login")
    registry_login;;
  "health")
    health_check "$@";;
  "compose")
    compose_cmd "$@";;
  "help"|"-h"|"--help")
    show_help;;
  *)
    show_help
    exit 1;;
esac
