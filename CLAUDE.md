# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

**盗梦都市（Inception City Online / ICO）** —— 移动端优先的桌游《盗梦都市》在线多人复刻，PWA、匿名身份、支持私有部署。

- 玩家人数：3-10（默认 5-8，4 人有变体规则）
- 核心冲突：1 梦主 vs 多盗梦者（隐藏信息 + 非对称对抗）
- 当前阶段：**核心玩法与大部分角色已实装，可本地人机对战，也可通过好友房进行服务端权威的联机对局**（详见下方「实现现状」）

## ⚠️ 不可协商的硬约束

### 信息不对称是游戏核心

- 金库内容、贿赂牌成败（DEAL/碎裂）、手牌内容 = 每玩家独有秘密
- **任何** WebSocket 广播前必须经过服务端过滤（per-recipient 重写事件），防止抓包作弊
- 客户端永远**不能**信任，所有合法性判定在服务端

### 匿名身份

- 无注册、无邮箱、无密码
- 身份 = localStorage JWT + 8 位恢复码（Crockford's Base32）
- 跨设备迁移仅靠恢复码（一次性 + 重置机制）

### 私有部署友好

- 所有外部依赖（数据库、埋点、对象存储、短链）必须有开源替代或内置实现
- 不得硬编码云厂商 SDK；域名/路径/密钥全部走环境变量
- `docker-compose up` 必须能在 1 台 2vCPU/1GB 机器上跑起来

## 技术栈（版本锁定）

| 层次 | 技术 | 版本 |
|------|------|------|
| 语言 | TypeScript | 5.x |
| 游戏引擎 | Boardgame.io | 0.50.x |
| 前端 | React + Vite | 18 / 5 |
| PWA | vite-plugin-pwa + Workbox | latest |
| 本地 AI | Web Worker + Comlink | latest |
| UI 状态 | Zustand | 4.x |
| 数据请求 | TanStack Query | 5.x |
| UI 组件 | Tailwind + shadcn/ui + Framer Motion | latest |
| 后端 | Node.js + Koa + TypeScript | 20+ |
| 持久化 | PostgreSQL 16 + Redis 7 | - |

## 实现现状

> 截至 2026-10-05，依据对代码的逐项核实。

**可用**

- 本地人机对局（引擎与 Bot 都运行在浏览器内）：回合流程、4–10 人、20 种行动牌、6 张梦魇牌，以及 38 名盗梦者与 15 名梦主的大部分技能
- 对局界面：PC 围坐椭圆 + 移动端行动轴双模式
- 好友房联机对局：房主建房、其他人凭房间码加入、空位可补 Bot，开始后全体进入同一局服务端权威对局；刷新或断线后回到同一局
- 匿名身份（JWT + 恢复码）、房间创建与加入、新手教程、PWA 离线访问
- 工程基建：pnpm + Turborepo monorepo、单元测试 3200+ 条、双浏览器联机端到端用例、Docker Compose 部署文件

**联机对局的实现方式**

- 服务端权威对局：房间开始游戏后在服务端建立对局，由对局运行器驱动引擎；move 经形状校验、限流与行动权检查后串行执行；Bot 座位与超时由服务端代为行动
- 信息隔离：发给每个连接的状态是按座位裁剪的白名单视图，事件的私密部分只发给被点名的座位；随机种子与完整状态不出服务端
- 持久化：进行中的对局存 Redis，逐步记录存 PostgreSQL；服务重启后恢复未结束的对局；回放接口读取逐步记录并按座位裁剪
- 客户端：本地对局与联机对局共用同一套对局界面，区别只在状态来源（本地 Worker 或服务端连接）；界面只拿到按座位裁剪的视图
- 联机时有 6 类需要玩家应答的情形（如天秤、白羊、处女的选择，被射击时的响应）还没有操作界面：轮到真人应答时只显示等待提示，到时限后由服务端代为处理

**已有实现但尚未接入运行路径**

- 成就、最佳玩家评分、举报与运营审核的后端接口和计算函数（尚未消费对局数据）
- 聊天、头像、举报等客户端组件（尚未挂载到页面）

**已知缺口**

- 部分角色技能与世界观未接入对局，另有若干规则细节与原版有出入
- 尚不支持 3 人局
- 旁观、公开匹配、对局内聊天、回放播放器、多实例部署
- 联机对局没有事件驱动的动画，状态变化直接刷新
- 启发式 Bot、渗透测试、动画音效、完整的无障碍支持与英文本地化
- 持续集成流水线已编写，尚未实际运行

## 仓库结构

```
.
├── LICENSE / NOTICE / README.md    # 对外入口文件
├── CLAUDE.md                       # 本文件
├── docs/
│   ├── manual/                     # 原版桌游规则说明
│   ├── ops/                        # 部署与性能基线等运维文档
│   └── superpowers/specs/          # 定稿后公开的设计规格
├── game/                           # 产品代码（pnpm monorepo）
│   ├── packages/
│   │   ├── shared/                 # 共享类型、卡牌数据、通用规则
│   │   ├── game-engine/            # 游戏引擎（对局定义、moves、技能，含对局运行器）
│   │   ├── bot/                    # AI Bot
│   │   ├── server/                 # Koa 服务端（REST / WebSocket / Prisma）
│   │   ├── client/                 # React PWA 客户端
│   │   └── e2e/                    # Playwright 端到端测试
│   ├── docker/                     # Dockerfile 与 Compose
│   └── scripts/                    # 工程脚本
└── experimental_demo/              # 早期技术验证原型（独立子项目）
```

## 常用命令

以下命令均在 `game/` 目录下执行（Node.js ≥ 20，pnpm ≥ 9）：

```bash
pnpm install                          # 安装依赖
pnpm dev                              # 启动全部开发服务（服务端 + 客户端）
pnpm test                             # 全部包的测试（含 E2E 包，需先装好 Playwright 浏览器）
pnpm --filter @icgame/server test     # 只跑某个包的单元测试
pnpm --filter @icgame/e2e test:online # 双浏览器联机端到端（全内存服务端，需本机装有 Chrome）
pnpm typecheck                        # 类型检查
pnpm lint                             # ESLint
pnpm build                            # 构建
pnpm copyright:check                  # 扫描对外产物中的内部术语 / 版权合规

docker compose -f docker/docker-compose.yml up -d   # 私有部署，详见 docs/ops/
```

## 术语统一（代码 + 文档必须一致）

| 中文 | 代码常量 | 说明 |
|------|---------|------|
| 梦主 | `master` / `DM` | 反派阵营 |
| 盗梦者 | `thief` | 正派阵营 |
| 梦境层 | `layer=0..4` | 0 为迷失层 |
| 心锁 | `HL` | 蓝色骰 |
| 金库 | `vault` | 含秘密或金币 |
| 贿赂牌 | `bribe` | DEAL 使盗梦者转阵营 |
| 梦魇牌 | `nightmare` | 梦主特殊武器 |
| 世界观 | `worldView` | 梦主全局规则 |
| 黄金定律 | `goldenRule` | 技能 > 行动牌 > 世界观 > 梦魇 > 规则 |

阵营类型：`type Faction = 'thief' | 'master';`

## 代码规范

- **注释语言**：与文件所在模块/项目已有注释保持一致；新模块默认中文注释
- **规则引用**：凡是直接复刻原版规则的逻辑，必须在注释中引用 `docs/manual/NN-xxx.md` 行号
- **命名**：禁止使用 `optimize` / `fix` / `improved` / 版本号等后缀；禁止 AI 标识或 Co-Authored-By
- **服务端优先**：所有涉及隐藏信息的判定一律服务端执行，客户端只做展示
- **UI 图标规范**：UI 层**禁止**使用 emoji 字符作为图标，所有图标必须使用 `lucide-react` 组件；注释/文档/测试中的 emoji 标记（如 `🤖` 徽章）不受此限制

## 对局界面多路径地图（⚠️ 改 UI 前必读）

**对局界面（Match UI）有三条并行渲染路径，任何视觉/布局改动都必须同步评估是否需要三路同改。路径 A 有本地与联机两个状态来源，共用同一套界面：**

| 路径 | 入口 URL | 驱动组件 | 状态源 | 用途 |
|------|---------|---------|-------|------|
| **A · 真实对局（本地）** | `/local` / `/game/:matchId?friend=1&players=N` | `components/LocalMatchRuntime/index.tsx` → `components/MatchRuntime/` | 本地 Worker（`workers/localMatch.worker.ts`），由对局运行器驱动真实引擎，只向界面交出按座位裁剪的视图 | 人机对战；后端不可达时好友房的本地模式 |
| **A · 真实对局（联机）** | `/game/:matchId?online=1` | `components/RemoteMatchRuntime/index.tsx` → `components/MatchRuntime/` | 服务端权威对局（`match/matchSocket.ts` 经 WebSocket 接收视图与事件） | 好友房联机对局 |
| **B · Mock 调试视图** | `/game/:matchId` 不带 `online` / `friend` 参数 | `pages/Game/index.tsx → GameMockView` | `hooks/useMockMatch.ts`（静态 mock） | 开发调试、UI 走查、视角切换（`?as=master` / `?pending=1`） |
| **C · 旧降级 UI** | 任一路径 + `?legacyUi=1` | `pages/Game/{ThiefBoard,MasterBoard}` | 同上 | 新 UI 上线后的应急降级通道 |

**核心组件（所有路径共用）：**

- `components/PlayerSeat/` — PC 围坐座位节点（≥1024px）
- `components/ActionDock/` — 底部操作栏
- `components/TargetPickerDialog/` — 统一目标选择弹层（按 playerOrder + 角色卡面）
- `components/GameCard/` — 卡牌渲染（`orientation` + 长按/双击查看详情）
- `components/CardDetailModal/` — 详情弹窗（`disableFlip` 控制翻面）
- `components/LayerBadge/` — 梦境层徽
- `hooks/useCardPressDetail.ts` — 长按 2000ms / PC 双击 / 键盘统一交互
- `hooks/useMediaQuery.ts` — PC/移动视口分派
- `pages/Game/Table/` — PC 围坐椭圆舞台（`TableStage` / `MatchTable` / `seatLayout`）
- `pages/Game/Track/` — 移动端星穹铁道行动轴（`TurnOrderRail` / `MatchTrack` / `MasterPanelCollapsible` / `turnOrder`）
- `pages/Game/shared/` — 双路径复用（`CenterPanel` 中央桌面 / `MasterConsole` 梦主控制台）

**真实对局（路径 A）接入新 UI 的方式：**

- `components/MatchRuntime/index.tsx` 是本地与联机共用的对局界面，只依赖对局来源接口 `match/matchSource.ts`（视图、发 move、本人座位、连接状态、座位信息）；本地实现是 `match/useLocalMatchSource.ts`，联机实现是 `match/useRemoteMatchSource.ts`
- 界面拿到的永远是**按座位裁剪的视图**（他人手牌只有张数、牌库只有张数），不要在界面里读完整状态才有的字段；本人座位取自来源接口，不得写死座位号（`MatchRuntime/noHardcodedSeat.test.ts` 会拦）
- 适配器 `components/MatchRuntime/viewAdapter.ts` 把视图（`G` / `ctx`）转为 `MockMatchState` 供新 UI 复用
- `components/MatchRuntime/RuntimeStage.tsx` 做视口分派（PC → `TableStage` / 移动 → `TurnOrderRail`），仅负责**展示层**
- 对局页的分流规则在 `pages/Game/resolveGameMode.ts`
- MatchRuntime 自己的 Dialog 群（TargetPlayerPickerDialog、ShooterLayerPickerDialog、嫁接/万有引力/棋局易位等）**保留原样**——新 UI 的 `TargetPickerDialog` 仅服务于 Mock 调试路径

**改 UI 时的自检清单：**

1. 访问 `/local`（路径 A）确认新视觉生效；改动涉及连接状态、座位标识、等待提示时，再起服务端从好友房进一局联机对局确认
2. 访问 `/game/debug?as=master`（路径 B）确认 mock 路径生效
3. 访问任一路径 + `?legacyUi=1`（路径 C）确认降级通道仍可用
4. PC 1280×800 + 移动 iPhone 12（390×844）两个视口都要走查
5. 如果改动影响状态结构（`MockMatchState` / 对局状态 `G`），务必同步更新 `viewAdapter.ts` + 测试

**交互硬规范：**

- 长按阈值：`lib/interactionConfig.ts` 的 `LONG_PRESS_MS = 2000ms`（PC + 移动端统一）
- 金库牌 / 梦境层卡 **不触发**长按/双击详情（图案已明显）
- 金库翻开后的详情 **禁止翻面**（背面属游戏机密，`CardDetailModal.disableFlip = true`）
- 选目标统一走 `TargetPickerDialog` 弹层，Seat / RailSlot **只看不选**

---

## 日志规范

**所有日志必须走统一 logger，禁止散落 `console.*`（降级 / 第三方透传除外）：**

- **客户端**：`packages/client/src/lib/logger.ts`
- **服务端**：`packages/server/src/infra/logger.ts`（pino）

### 等级约定

| 等级 | 何时用 | dev 模式 | prod 模式 |
|------|-------|---------|----------|
| **ERROR** | 异常 / 请求失败 / 不可恢复错误 | 显示 | 显示（必须） |
| **WARN** | 降级 / 业务拒绝 / 非致命异常 | 显示 | 显示 |
| **INFO（= logger.flow）** | **游戏流程关键点位**（对局创建、回合切换、玩家 move、胜负、房间创建/加入/Start） | **详尽**输出 | 静默 |
| **DEBUG（= logger.ai）** | **AI 决策 / Bot move 选择** / 状态刷新 / 内部调度 | 输出 | 静默 |
| **TRACE** | 帧级调试 | 需手动开启 | 不输出 |

### Channel 命名

约定形式：`<domain>/<subsystem>`，例：
- `game/worker`（对局 worker 流程）
- `game/move`（玩家 move）
- `ai/worker`（Worker 内 Bot 决策，走 DEBUG）
- `lobby`、`room`、`identity`
- `net/ws`（WebSocket 网关）

### 客户端用法

```ts
import { logger } from '@/lib/logger';

logger.flow('game/turn', 'turn begin', { turn: 3, currentPlayer: '0' });
logger.ai('ai/worker', 'bot 2 plays endActionPhase', { legalMoves });
logger.warn('room', 'backend unavailable, fallback to mock');
logger.error('room', 'createRoom failed', err);
```

**控制输出等级**：
- dev 模式默认 DEBUG（INFO + DEBUG 全显示）
- prod 模式默认 WARN（仅 WARN + ERROR）
- 运行时覆盖：`localStorage.setItem('icgame-log-level', 'trace')`

### 服务端用法

pino 结构化日志 + pino-pretty（dev）。

```ts
import { logger } from './infra/logger.js';

logger.info({ matchId, playerId }, 'move accepted');
logger.debug({ botId, move }, 'bot decided');  // AI 走 debug
logger.warn({ err }, 'rate limit exceeded');
logger.error({ err, matchId }, 'state corruption');
```

### 强制打点清单

任何涉及以下事件的代码**必须**有 INFO/FLOW 级别日志：

- 身份：init / recover / logout
- 房间：createRoom / joinRoom / leaveRoom / fillAI / startGame
- 对局：runtime 挂载 / 对局开始 / 回合开始 / 玩家 move / 胜负产生
- AI 决策（DEBUG）：Bot 选中 move / 参数构造失败
