# 盗梦都市 · Docker 一键部署指南

> **目标：** 在一台全新的 2 vCPU / 1 GB 内存 VPS 上，3 分钟内启动完整服务栈（前端 + 后端 + Postgres + Redis）。

## 目录

- [前置条件](#前置条件)
- [快速开始](#快速开始)
- [环境变量说明](#环境变量说明)
- [常见操作](#常见操作)
- [故障排查](#故障排查)
- [生产加固建议](#生产加固建议)

---

## 前置条件

| 组件 | 版本 | 备注 |
| --- | --- | --- |
| Docker Engine | ≥ 24 | `docker -v` |
| Docker Compose | ≥ 2.20 | 通常随 Docker Desktop 或 `docker-compose-plugin` 附带 |
| VPS 最低配置 | 2 vCPU / 1 GB / 10 GB 磁盘 | 带 PostgreSQL + Redis |

安装 Docker（Debian/Ubuntu）：

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## 快速开始

> 以下命令在仓库的 `game/` 目录下执行。

### 1. 克隆仓库

```bash
git clone <仓库地址> inception-board-game
cd inception-board-game/game
```

### 2. 准备环境变量

```bash
cp .env.example .env
# 至少修改以下两项：
#   JWT_SECRET          — 生产环境必须改（openssl rand -base64 48）
#   POSTGRES_PASSWORD   — 强密码
vim .env
```

### 3. 启动

```bash
docker compose -f docker/docker-compose.yml up -d
```

> 首次启动会拉取镜像 + 编译产物，大约需要 2-5 分钟；后续启动 <30 秒。

### 4. 验证

```bash
# 前端健康检查
curl -fsS http://localhost/

# 后端 liveness
curl -fsS http://localhost:3001/health

# 后端 readiness（DB 探测）
curl -fsS http://localhost:3001/ready
```

浏览器访问 `http://<VPS-IP>/` 即可看到首屏。

---

## 环境变量说明

见 [.env.example](../../game/.env.example)。重点关注：

| 变量 | 必改 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | **是** | JWT 签名密钥；必须是 32+ 字节随机串 |
| `POSTGRES_PASSWORD` | **是** | 数据库密码 |
| `WS_CORS_ORIGIN` | 建议改 | 生产填前端域名（如 `https://ico.example.com`），开发用 `*` |
| `CLIENT_PORT` | 可选 | 前端对外端口，默认 80；如被占用改为 8080 |
| `API_PORT` | 可选 | 后端对外端口，默认 3001 |
| `LOG_LEVEL` | 可选 | 生产建议 `info`，调试用 `debug` |

---

## 常见操作

### 查看日志

```bash
# 全部服务
docker compose -f docker/docker-compose.yml logs -f

# 仅后端
docker compose -f docker/docker-compose.yml logs -f api

# 最近 200 行
docker compose -f docker/docker-compose.yml logs --tail=200 api
```

### 重启单个服务

```bash
docker compose -f docker/docker-compose.yml restart api
```

### 进入容器 shell

```bash
docker compose -f docker/docker-compose.yml exec api sh
docker compose -f docker/docker-compose.yml exec postgres psql -U icgame
```

### 更新部署

```bash
git pull
docker compose -f docker/docker-compose.yml build --no-cache
docker compose -f docker/docker-compose.yml up -d
```

### 数据库迁移（手动触发）

```bash
docker compose -f docker/docker-compose.yml exec api \
  sh -c "cd /app/packages/server && pnpm exec prisma migrate deploy"
```

### 停止与清理

```bash
# 停止但保留卷（下次启动数据仍在）
docker compose -f docker/docker-compose.yml stop

# 彻底清理（含数据卷，谨慎！）
docker compose -f docker/docker-compose.yml down -v
```

---

## 故障排查

### ❌ `JWT_SECRET must be set`

`.env` 文件里没配 `JWT_SECRET`。按环境变量说明补上。

### ❌ `api` 容器健康检查失败

1. 查日志：`docker compose logs api`
2. 常见原因：
   - 数据库未 ready（等 10-20 秒重试）
   - `DATABASE_URL` 或密码不对（对齐 `.env` 中的 `POSTGRES_*`）
   - `prisma migrate` 失败（手动进容器跑一次）

### ❌ 前端打开白屏

1. 检查 `VITE_API_BASE` / `VITE_WS_URL` 是否匹配实际部署
2. 默认 `/api` 和 `/ws` 走 nginx 反代，已在 `docker/nginx.conf` 配置好
3. 如自定义域名，在前端构建前设置 `VITE_API_BASE=https://api.example.com`

### ❌ 端口冲突（80/3001/5432/6379）

修改 `.env` 中对应的 `*_PORT` 变量。

---

## 生产加固建议

| 项目 | 建议 |
| --- | --- |
| **HTTPS** | 前置 Caddy / Traefik / 云厂商 SLB 处理 TLS |
| **密钥管理** | `JWT_SECRET` / `POSTGRES_PASSWORD` 使用 Docker Secret，不要直接写 `.env` |
| **数据备份** | `docker compose exec postgres pg_dump -U icgame icgame > backup.sql` 定期备份 |
| **日志收集** | 把 `docker compose logs` 接入 Loki / CloudWatch / 云监控 |
| **监控告警** | 后续版本将落地 Grafana 面板；当前可用 `/health` + `/ready` 简单探活 |
| **CORS 收敛** | `WS_CORS_ORIGIN` 禁用 `*`，改为具体前端域名 |
| **资源限制** | 在 `docker-compose.yml` 里加 `deploy.resources.limits` 防止单服务吞内存 |
| **Postgres 参数** | 对 4 GB+ 机器建议调 `shared_buffers` / `work_mem`，默认值足够 MVP |

---

## 清单（首次部署验收）

- [ ] `docker compose up -d` 无报错
- [ ] `curl http://localhost/` 返回 HTML（status 200）
- [ ] `curl http://localhost:3001/health` 返回 `{"status":"ok"}`
- [ ] `curl http://localhost:3001/ready` 返回 `{"status":"ready"}`
- [ ] 浏览器打开首屏可见 Landing 页
- [ ] `.env` 中 `JWT_SECRET` 已改为非默认值
- [ ] `.env` 中 `POSTGRES_PASSWORD` 已改为强密码
- [ ] 防火墙只开放 80/443（生产环境）

---

> 更多运维细节参考 `docs/ops/`（后续版本将持续补全 Runbook / 告警 SOP / 备份策略）。
