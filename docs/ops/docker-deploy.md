# 盗梦都市 · Docker 一键部署指南

> **目标：** 在一台全新的 2 vCPU / 1 GB 内存 VPS 上，3 分钟内启动完整服务栈（前端 + 后端 + Postgres + Redis）。

## 目录

- [前置条件](#前置条件)
- [快速开始](#快速开始)
- [环境变量说明](#环境变量说明)
- [镜像与仓库](#镜像与仓库)
- [常见操作](#常见操作)
- [本机开发环境](#本机开发环境)
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

> 以下命令在仓库的 `game/` 目录下执行。部署相关文件都在 `deploy/`（`dev` 本机开发、`prod` 生产）与 `scripts/`（`dev.sh`、`prod.sh`）里。

### 1. 克隆仓库

```bash
git clone <仓库地址> inception-board-game
cd inception-board-game/game
```

### 2. 初始化

```bash
./scripts/prod.sh init
```

动作：创建数据目录 `deploy/prod/data/`；`.env` 不存在时从 `.env.example` 复制；`JWT_SECRET`、`RECOVERY_CODE_PEPPER`、`POSTGRES_PASSWORD`、`REDIS_PASSWORD` 为空时各生成一个随机值写回 `.env`（已有值不覆盖）；最后写入锁文件 `deploy/prod/.init.lock`，重复运行会被拦下。

随后按需检查 `.env`，生产至少把 `WS_CORS_ORIGIN` 改成前端域名。

### 3. 构建镜像

```bash
./scripts/prod.sh build
```

> 首次构建约需十分钟，会构建 `icgame-api` 与 `icgame-client` 两个镜像；只构建其中一个：`./scripts/prod.sh build api`。若已有镜像仓库，可用 `pull` 代替，见下文「镜像与仓库」。

### 4. 启动与验证

```bash
./scripts/prod.sh start
./scripts/prod.sh health
```

`health` 逐项探活：postgres、redis、后端 `/health` 与 `/ready`、前端首页、经前端端口反代的 `/api/health`；全部通过退出码为 0，否则非零并标出失败项。

浏览器访问 `http://<VPS-IP>/` 即可看到首屏。

---

## 环境变量说明

开发与生产共用 `game/.env`，模板见 [.env.example](../../game/.env.example)，按节分组。重点关注：

| 变量 | 必改 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 必填 | JWT 签名密钥；留空由 `prod.sh init` 生成 |
| `RECOVERY_CODE_PEPPER` | 必填 | 恢复码哈希密钥；留空由 `prod.sh init` / `prod.sh secrets` 生成。生产环境缺失或短于 16 个字符时服务启动即退出。更换后已发出的恢复码全部失效，请勿随意修改 |
| `OPERATOR_TOKEN` | 可选 | 运营接口（封禁 / 解封等）的访问令牌；留空即关闭运营接口。至少 16 个字符，更短的视为未配置（接口保持关闭，启动时打一条警告），建议用长随机串 |
| `OPERATOR_ID` | 可选 | 运营操作员标识，写入封禁 / 解封的日志；留空用默认值 |
| `POSTGRES_PASSWORD` | 必填 | 数据库密码；留空由 `prod.sh init` 生成 |
| `REDIS_PASSWORD` | 必填 | Redis 密码；留空由 `prod.sh init` 生成。只用字母和数字：它会被拼进连接地址，特殊字符需要转义 |
| `POSTGRES_DB` / `POSTGRES_USER` | 可选 | 数据库名与用户，默认 `icgame` |
| `WS_CORS_ORIGIN` | 建议改 | 允许访问后端的页面来源，接口请求与联机实时连接共用；生产填前端域名（如 `https://ico.example.com`），开发用 `*` |
| `TRUST_PROXY` | 可选 | 默认 `1`（后端前面是 nginx）：接口限流按 `X-Forwarded-For` 的真实来源地址计数。如果自行把后端端口改为对外开放，不要开启，否则来源地址可被伪造 |
| `HTTP_RATE_LIMIT_PER_MINUTE` | 可选 | 接口限流：同一来源地址每分钟的请求额度，默认 300（同一出口下 10 人的等待页轮询约 200 次 / 分钟） |
| `REDIS_COMMAND_TIMEOUT_MS` | 可选 | Redis 单条命令的超时（毫秒），默认 5000；留空即默认，非法值也回落默认。连接半开时命令超时后按失败处理，不会一直挂住 |
| `CLIENT_PORT` | 可选 | 前端对外端口，默认 80（对所有网卡开放）；如被占用改为 8080 |
| `API_PORT` | 可选 | 后端在宿主机上的端口，默认 3001；只绑定本机（`127.0.0.1`），用于本机探活与排查。局域网和公网用户通过前端端口访问，由 nginx 转发到后端。Postgres 与 Redis 不映射宿主机端口 |
| `LOG_LEVEL` | 可选 | 生产建议 `info`，调试用 `debug` |
| `MATCH_BOT_STEP_DELAY_MS` | 可选 | Bot 每一步之间的间隔，默认 600 毫秒 |
| `MATCH_PENDING_TIMEOUT_MS` | 可选 | 等待玩家应答（响应、选择目标等）的时限，默认 45000 毫秒；超时由服务端代为行动 |
| `MATCH_TURN_TIMEOUT_MS` | 可选 | 一个回合的时限，默认 120000 毫秒；超时由服务端代为结束回合 |
| `IMAGE_NAMESPACE` / `IMAGE_TAG` | 可选 | 镜像命名空间与标签，默认 `icgame` / `latest` |
| `IMAGE_REGISTRY` | 可选 | 镜像仓库地址；留空表示只在本机构建使用，`push` / `pull` / `registry-login` 不可用 |
| `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` | 可选 | 镜像仓库账号 |
| `VITE_API_URL` | 可选 | 前端构建参数：浏览器访问后端接口的地址。默认 `/api`（同域，由 nginx 反代）；前后端分域部署时填完整地址，如 `https://api.example.com` |
| `VITE_WS_URL` | 可选 | 前端构建参数：联机对局实时连接的地址。默认 `/ws`，此时与 `VITE_API_URL` 同源（同域部署即当前页面的域名）；单独部署实时服务时填完整地址 |
| `DEV_POSTGRES_PORT` / `DEV_REDIS_PORT` | 可选 | 开发环境容器在本机的端口，默认 15432 / 16379 |
| `DEV_POSTGRES_PASSWORD` / `DEV_REDIS_PASSWORD` | 可选 | 开发环境容器的密码（仅限本机开发），默认 `icgame_dev_only` |
| `DATABASE_URL` / `REDIS_URL` | 开发用 | 供 `dev.sh` 导出给 `pnpm dev` 的服务端，与开发容器的端口、密码一致；生产容器的连接地址由编排文件自行拼出，不读这两项 |

对局运行在单个服务进程内：进行中的对局状态存放在 Redis，每一步的记录写入 PostgreSQL。服务重启后会从 Redis 恢复未结束的对局；目前不支持多个服务实例同时承载对局。因此 Redis 没有设置内存淘汰策略。

---

## 镜像与仓库

编排文件里不写构建段，镜像由 `prod.sh build` 构建，名称为：

- `<IMAGE_NAMESPACE>/icgame-api:<IMAGE_TAG>`
- `<IMAGE_NAMESPACE>/icgame-client:<IMAGE_TAG>`

只在一台机器上部署时，`build` 之后直接 `start` 即可，不需要仓库。要在多台机器间分发，配置一个任意的 OCI 镜像仓库：

```bash
# .env
IMAGE_REGISTRY=registry.example.com
REGISTRY_USERNAME=...
REGISTRY_PASSWORD=...

./scripts/prod.sh registry-login   # 登录
./scripts/prod.sh push             # 构建机：推送（IMAGE_TAG 非 latest 时同时推 latest）
./scripts/prod.sh pull             # 部署机：拉取并标记为本地镜像名
```

`IMAGE_REGISTRY` 为空时，`push` / `pull` / `registry-login` 会提示并以非零码退出。三者都可以只处理其中一个镜像：`push api`、`pull client`。

---

## 常见操作

所有命令在 `game/` 下执行；`./scripts/prod.sh help` 列出全部命令。

### 查看日志

```bash
./scripts/prod.sh logs -f              # 全部服务
./scripts/prod.sh logs -f api          # 仅后端
./scripts/prod.sh logs --tail=200 api  # 最近 200 行
```

### 启停与重启

```bash
./scripts/prod.sh start
./scripts/prod.sh stop
./scripts/prod.sh restart api          # 重启单个服务
./scripts/prod.sh ps
```

### 进入容器

```bash
./scripts/prod.sh compose exec api sh
./scripts/prod.sh compose exec postgres psql -U icgame
```

### 补生成缺失密钥

```bash
./scripts/prod.sh secrets
```

给 `.env` 里为空或缺失的必填密钥（`JWT_SECRET`、`RECOVERY_CODE_PEPPER`、`POSTGRES_PASSWORD`、`REDIS_PASSWORD`）补生成随机值，已有值不动；不受初始化锁限制。

### 更新部署

```bash
git pull
./scripts/prod.sh secrets      # 补生成新版本新增的必填密钥（已有值不动；没有新增时什么都不会改）
./scripts/prod.sh build        # 或在配置了仓库后 ./scripts/prod.sh pull
./scripts/prod.sh restart
```

`init` 只能运行一次（有锁文件），而新版本可能新增必填密钥（例如 `RECOVERY_CODE_PEPPER`）。已经初始化过的部署更新后，如果直接启动被提示「某某未设置」，运行 `./scripts/prod.sh secrets` 即可，它不受初始化锁限制，只给 `.env` 里为空或缺失的必填密钥补生成。

### 数据库迁移（手动触发）

后端容器每次启动都会先执行 `prisma migrate deploy`。需要手动触发时：

```bash
./scripts/prod.sh compose exec api \
  sh -c "cd /app/packages/server && pnpm exec prisma migrate deploy"
```

### 停止与清理

```bash
# 停止并移除容器，数据仍在 deploy/prod/data/（下次启动数据仍在）
./scripts/prod.sh stop

# 彻底清理数据：先停止，再删除数据目录（谨慎！）
rm -rf deploy/prod/data/pg-data deploy/prod/data/redis-data
```

### 备份

数据在 `deploy/prod/data/` 下（`pg-data`、`redis-data`）。数据库的逻辑备份：

```bash
./scripts/prod.sh compose exec -T postgres pg_dump -U icgame icgame > backup.sql
```

---

## 本机开发环境

开发时 Postgres 与 Redis 跑在容器里，服务端与前端在宿主机用 `pnpm` 运行：

```bash
cp .env.example .env              # 开发用的变量保持默认即可
./scripts/dev.sh up               # 启动开发用 Postgres（127.0.0.1:15432）与 Redis（127.0.0.1:16379）
./scripts/dev.sh migrate          # 对开发库执行 prisma migrate dev
./scripts/dev.sh dev              # pnpm dev：服务端 + 客户端
```

`dev.sh` 启动时会把 `.env` 导出到环境，服务端运行时不读 `.env` 文件，靠的就是这里导出的 `DATABASE_URL`、`REDIS_URL`。`VITE_API_URL`、`VITE_WS_URL` 是生产镜像的构建参数，开发时不会导出（前端直连 `localhost:3001`）。不带参数运行 `./scripts/dev.sh` 进入交互菜单。

| 命令 | 作用 |
| --- | --- |
| `up` / `down` / `restart` / `ps` / `logs` / `compose` | 开发容器管理 |
| `psql` | 进入开发库 |
| `migrate` / `migrate-deploy` / `generate` | `prisma migrate dev` / `migrate deploy` / `generate` |
| `redis-cli` / `redis-info` | 进入 redis-cli（自动带密码）/ INFO |
| `redis-scan [前缀]` | 按前缀列出键，默认 `ico:*` |
| `redis-flush` | 清空开发 Redis 当前库（要求输入 yes 确认） |
| `dev` / `test` / `build` / `install` | 对应的 `pnpm` 命令 |
| `e2e-online` | 双浏览器联机端到端 `pnpm --filter @icgame/e2e test:online` |

开发数据在 `deploy/dev/local/` 下，已被 git 忽略。

---

## 故障排查

### 启动时提示 `JWT_SECRET 未设置` / `POSTGRES_PASSWORD 未设置` / `REDIS_PASSWORD 未设置`

`.env` 里没配对应项。首次部署运行 `./scripts/prod.sh init`；已经初始化过的部署运行 `./scripts/prod.sh secrets`（只补缺失项，已有值不动），或手动补上。

### `api` 容器健康检查失败

1. 查日志：`./scripts/prod.sh logs api`
2. 常见原因：
   - 数据库未 ready（等 10-20 秒重试）
   - 修改了 `.env` 的数据库密码，但数据目录里是用旧密码初始化的（Postgres 只在首次初始化时读取密码；需要改密码就进库里改，或清掉 `deploy/prod/data/pg-data` 重来）
   - `prisma migrate` 失败（手动进容器跑一次）

### 前端打开白屏

1. 检查 `VITE_API_URL` / `VITE_WS_URL` 是否匹配实际部署
2. 默认 `/api` 和 `/ws` 走 nginx 反代，已在 `deploy/prod/client/nginx.conf` 配置好
3. 如自定义域名，在前端构建前设置 `VITE_API_URL=https://api.example.com`
4. 这两个变量在构建前端镜像时写入产物，修改后需要重新构建 `client` 镜像（`./scripts/prod.sh build client`）才生效

### 端口冲突（80 / 3001）

修改 `.env` 中的 `CLIENT_PORT` / `API_PORT`。

### 用 `health` 定位哪一层出了问题

`./scripts/prod.sh health` 会指出失败的是哪一项：postgres / redis 失败看对应容器日志；`api /health` 通过而 `/ready` 失败，说明后端起来了但连不上数据库；前端首页通过而 `/api/health` 失败，说明 nginx 到后端的反代有问题。

---

## 生产加固建议

| 项目 | 建议 |
| --- | --- |
| **HTTPS** | 前置 Caddy / Traefik / 负载均衡处理 TLS |
| **密钥管理** | `JWT_SECRET` / `POSTGRES_PASSWORD` / `REDIS_PASSWORD` 使用 Docker Secret，不要直接写 `.env` |
| **数据备份** | 定期做 `pg_dump`（见上文「备份」），并备份 `deploy/prod/data/` |
| **日志收集** | 把 `./scripts/prod.sh logs` 的输出接入 Loki 等日志系统 |
| **监控告警** | 后续版本将落地 Grafana 面板；当前可用 `/health` + `/ready` 简单探活 |
| **CORS 收敛** | `WS_CORS_ORIGIN` 禁用 `*`，改为具体前端域名 |
| **后端端口** | 默认只绑定本机，外部访问一律经前端端口。不要把 `api` 服务的端口映射改成对外开放；确有需要时同时把 `TRUST_PROXY` 设为 `0` |
| **数据库与 Redis 端口** | 生产编排不映射它们的宿主机端口，不要自行加上 |
| **Redis 淘汰策略** | 不要给 Redis 设置内存淘汰策略：它存着进行中的对局，被淘汰会让对局丢失 |
| **资源限制** | 在 `deploy/prod/docker-compose.prod.yml` 里加 `deploy.resources.limits` 防止单服务吞内存 |
| **Postgres 参数** | 对 4 GB+ 机器建议调 `shared_buffers` / `work_mem`，默认值足够当前规模 |

---

## 清单（首次部署验收）

- [ ] `./scripts/prod.sh init` 完成，`.env` 中三个必填密钥均非空
- [ ] `./scripts/prod.sh build` 无报错
- [ ] `./scripts/prod.sh start` 无报错
- [ ] `./scripts/prod.sh health` 全部通过（退出码 0）
- [ ] 浏览器打开首屏可见 Landing 页
- [ ] `.env` 中 `WS_CORS_ORIGIN` 已改为前端域名
- [ ] 防火墙只开放 80/443（生产环境）

---

## 探活

`./scripts/prod.sh health [秒数]` 逐项探活，每项最长等待 60 秒（可由参数指定）：

1. postgres：`pg_isready`
2. redis：带密码 `PING`
3. 后端 `/health`（`127.0.0.1:API_PORT`）
4. 后端 `/ready`（含数据库连通）
5. 前端首页（`127.0.0.1:CLIENT_PORT`）
6. 经前端端口反代的 `/api/health`

全部通过时退出码为 0，否则非零并标出失败项，可直接用于脚本或持续集成中的部署后检查。需要本机装有 `curl`。

---

> 更多运维细节参考 `docs/ops/`（后续版本将持续补全 Runbook / 告警 SOP / 备份策略）。
