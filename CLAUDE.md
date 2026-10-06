# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

**盗梦都市（Inception City Online / ICO）** —— 移动端优先的桌游《盗梦都市》在线多人复刻，PWA、匿名身份、支持私有部署。

- 玩家人数：原版 3-10；本项目目前支持 4-10（默认 5-8，4 人有变体规则），3 人局尚未支持
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

## 技术栈

> 版本为实际安装的主版本，以各包 `package.json` 为准。

| 层次 | 技术 | 版本 |
|------|------|------|
| 语言与工具链 | TypeScript · Node.js · pnpm · Turborepo | 5.9 · ≥ 22 · 10 · 2 |
| 游戏引擎 | 自建对局运行器（`game-engine/src/runner/`） | - |
| 引擎对照 | boardgame.io（仅开发依赖，供差分测试对照，不进运行路径） | 0.50 |
| 前端 | React · Vite · React Router | 19 · 8 · 8 |
| PWA | vite-plugin-pwa（Workbox） | 2.x |
| 本地 AI | Web Worker + Comlink | 4 |
| UI 状态 | Zustand | 5 |
| 数据请求 | TanStack Query | 5 |
| UI 组件 | Tailwind · shadcn/ui · Framer Motion · lucide-react | 4 · - · 12 · 1.x |
| 国际化 | i18next | 26 |
| 后端 | Koa · socket.io · pino · zod | 3 · 4 · 10 · 4 |
| 持久化 | PostgreSQL（Prisma）· Redis（ioredis） | 16（7）· 7（5） |
| 测试 | Vitest · Playwright | 4 · 1.59 |

## 实现现状

> 截至 2026-10-05，依据对代码的逐项核实。

**可用**

- 本地人机对局（引擎与 Bot 都运行在浏览器内）：回合流程、4–10 人、20 种行动牌、6 张梦魇牌，以及 38 名盗梦者与 15 名梦主的大部分技能
- 对局界面：桌面（座位环 + 按主题加载的中央舞台 + 底部坞）与移动（行动轴 + 层塔 + 一体式手牌坞）双布局，主题换肤
- 好友房联机对局：房主建房、其他人凭房间码加入、空位可补 Bot，开始后全体进入同一局服务端权威对局；刷新或断线后回到同一局
- 匿名身份（JWT + 恢复码）、房间创建与加入、新手教程、PWA 离线访问
- 工程基建：pnpm + Turborepo monorepo、单元测试 3300+ 条、双浏览器联机端到端用例、Docker Compose 部署文件

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
│   ├── deploy/                     # 部署：dev（本机依赖）与 prod（Dockerfile / Compose / nginx）
│   └── scripts/                    # 工程脚本（含 dev.sh / prod.sh 环境管理脚本）
└── experimental_demo/              # 早期技术验证原型（独立子项目）
```

## 常用命令

以下命令均在 `game/` 目录下执行（Node.js ≥ 22，pnpm ≥ 9）：

```bash
pnpm install                          # 安装依赖
pnpm dev                              # 启动全部开发服务（服务端 + 客户端）
pnpm test                             # 全部包的单元测试（不含端到端）
pnpm test:coverage                    # 同上，并检查各包的覆盖率阈值（阈值在各包 vitest.config.ts）
pnpm test:e2e                         # 端到端测试（需先装好 Playwright 浏览器）
pnpm --filter @icgame/server test     # 只跑某个包的单元测试
pnpm --filter @icgame/e2e test:online # 双浏览器联机端到端（全内存服务端，需本机装有 Chrome）
pnpm typecheck                        # 类型检查
pnpm lint                             # ESLint
pnpm build                            # 构建
pnpm copyright:check                  # 扫描对外产物中的内部术语 / 版权合规

./scripts/dev.sh up                   # 本机开发：启动开发用 Postgres / Redis
./scripts/prod.sh init && ./scripts/prod.sh build && ./scripts/prod.sh start   # 私有部署，详见 docs/ops/
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

## 对局界面地图（⚠️ 改 UI 前必读）

**对局界面（Match UI）只有一套：`components/MatchRuntime/`。** 它只依赖对局来源接口 `match/matchSource.ts`（`MatchSource`：视图、本人座位、座位表、发 move、连接状态等），状态来源有三种，界面代码完全相同：

| 来源 | 入口 URL | 驱动组件 | 状态源 | 用途 |
|------|---------|---------|-------|------|
| **本地** | `/local` / `/game/:matchId?friend=1&players=N` | `components/LocalMatchRuntime/index.tsx` | `match/useLocalMatchSource.ts`：本地 Worker（`workers/localMatch.worker.ts`）经对局运行器驱动真实引擎，只向界面交出按座位裁剪的视图 | 人机对战；后端不可达时好友房的本地模式 |
| **联机** | `/game/:matchId?online=1` | `components/RemoteMatchRuntime/index.tsx` | `match/useRemoteMatchSource.ts`：服务端权威对局（`match/matchSocket.ts` 经 WebSocket 接收视图与事件） | 好友房联机对局 |
| **固定场景** | `/game/:matchId` 不带 `online` / `friend` 参数（常用 `/game/debug`） | `components/FixtureMatchRuntime/index.tsx` | `match/useFixtureMatchSource.ts`：固定种子建局、调整局面后经引擎的视角过滤得到视图（构造见 `match/fixtures/buildScenario.ts`），发出的 move 只记日志、不推进状态 | 开发调试、UI 走查、视角 / 人数 / 待应答状态切换 |

**固定场景的地址参数：** 缺省是 6 人局、盗梦者视角（行动阶段、手里有几种牌）；`?as=master` 梦主视角；`?pending=1` 有一个等待本人应答的【解封】响应窗口（可与 `as=master` 叠加）；`?players=N` 人数，4–10，缺失或非法回落 6，用来走查座位环在不同人数下的排布（如 `/game/debug?players=10`）。场景由 `match/fixtures/scenarios.ts` 的 `resolveFixtureScenario` 选择，同样的参数每次得到同样的视图。新增场景在 `buildScenario.ts` 里补，并在 `buildScenario.test.ts` 里验证它仍是引擎过滤后的结果。

### 代码分层

`components/MatchRuntime/` 内部分五层，依赖只往下：

| 层 | 位置 | 职责 |
|----|------|------|
| 控制层 | `useMatchController.ts` + `controllerDerive.ts`（纯推导）+ `controllerTypes.ts`（`MatchController`） | 从来源视图推导界面状态，持有出牌 / 弃牌 / 选目标的本地状态与回调；不含 JSX。布局与弹窗群只消费 `MatchController` |
| 共享模型 | `model/` | 与布局、主题无关的纯函数模型：`boardModel.ts`（盘面：各层心锁 / 金库 / 梦魇 / 占位者、牌库进度、回合横幅、焦点层）、`seatModel.ts`（座位展示数据）、`handDerive.ts`（读牌、能否打出、主操作）、`activity.ts`（最新动态）、`viewAdapter.ts` + `stageState.ts`（视图 → `StageState`）、`useBoardModel.ts`（把控制层接到盘面模型） |
| 布局 | `desktop/`（≥1024px）、`mobile/`（<1024px）；`index.tsx` 按 `(min-width: 1024px)` 分派 | 桌面：片头条 + 舞台（背景氛围 + 座位环 + 中央舞台 + 右上提示栈）+ 底部坞；移动：顶栏 + 层级标签 + 行动轴 + 层塔 + 一体式手牌坞。两个布局都用内联的解封响应窗口 / 响应条，不弹窗 |
| 弹窗群 | `MatchDialogs.tsx` | 选目标 / 选模式 / 多步选择等响应类弹窗，与布局无关 |
| 共用小件 | `shared/`（`PreloadLine` / `MatchOutcome` / `AwaitingNotice`）、`components/CardArt`、`components/Die`、`components/SeatStatusBadges` 等 | 两个布局共用 |

桌面座位的几何在 `desktop/seatPlan.ts`（纯函数，有测试）：梦主在上居中，盗梦者分列两侧，**本人不占座位环**（由底部坞承载）；座位牌按舞台实际大小与人数取放得下的最大一档，并给皮肤的中央舞台留出区域，保证 4–10 人、1024×768 及以上的视口里不重叠、不出界。

### 主题的三层模型

| 层 | 内容 | 位置 |
|----|------|------|
| 令牌 | 颜色、字体（18 个语义令牌，对应 CSS 变量 `--ms-*`） | `theme/themes.ts`（主表）与 `styles/index.css` 里的 `[data-theme='<id>']` 块，逐字一致，由 `theme/themeCss.test.ts` 保证 |
| 皮肤件 | 少量按主题切换的样式：卡牌画框、骰子、层徽、座位框、背景氛围 | 共用组件只带稳定的钩子类名，基础样式在 `styles/skins/base.css`，每个主题的差异在 `styles/skins/<id>.css`，全部限定在 `[data-theme='<id>']` 之下（关键帧放 `base.css`）；皮肤样式里**不许有颜色字面量**（装饰性取值用 `color-mix()` 基于令牌推导），由 `theme/skins/skins.test.ts` 保证 |
| 中央舞台 | 桌面端中央区，每个主题一个结构不同的组件，吃同一份盘面数据 | `components/MatchRuntime/stages/<id>/`，经 `React.lazy` 加载成独立 chunk，不进首屏包 |

移动端布局所有主题共用一套结构、只靠令牌换肤，没有按主题分叉的中央舞台。

**皮肤注册表**在 `theme/skins/`：`ThemeSkin`（`types.ts`）含 `CenterStage`（懒加载的中央舞台）、可选的 `Ambient`（铺在桌面舞台最底层的背景氛围）、`center`（中央舞台在舞台上占的宽度比例与最小高度，座位规划按它让位）；`index.ts` 的 `SKINS` 登记每个主题；`useThemeSkin()` 按当前主题取皮肤。中央舞台的接口是 `stages/types.ts` 的 `CenterStageProps`：`board`（`BoardModel`，与主题无关的盘面数据）+ `onFocusLayer` + `onOpenCard`。中央舞台只展示，不处理出牌与选目标；金库缩略图可点开详情（详情禁止翻面），梦境层牌不触发详情。

**样式钩子类名**（统一前缀 `ms-`，状态用数据属性表达）：

| 类名 | 对象 | 状态属性 |
|------|------|----------|
| `ms-stage` / `ms-ambient` / `ms-center` | 桌面舞台、背景氛围层、中央舞台区域 | `data-density`（座位牌档位） |
| `ms-topbar` | 片头条 | - |
| `ms-seat`（`-flag` / `-revtag` / `-name`）、`ms-faction-dot` | 座位牌与其中的文字、阵营点 | `data-current` / `data-lost` / `data-master` / `data-revealed` / `data-faction` |
| `ms-card` | 卡牌画框（座位卡面、身份卡、金库缩略图） | `data-opened`（金库） |
| `ms-layerbadge` | 层徽 | - |
| `ms-die`（`-pip`） | 骰子（`components/Die`，心锁骰用 `lock`、战斗骰用 `blood`） | `data-kind` = `lock` / `combat`，`data-empty` |
| `ms-handcard`（`-art` / `-badge`） | 手牌 | `data-selected` / `data-reading` / `data-blocked` / `data-category` |
| `ms-dock`（`-self` / `-ops`） | 底部坞 | - |
| `ms-btn` | 坞与响应窗口里的按钮 | `data-variant="primary"` |
| `ms-response` | 响应窗口 / 提示卡 | - |

**层级调色的钩子**（所有主题都输出，不用的主题不理它）：桌面与移动两个布局的根容器带 `data-tint-layer="0..4"`（取当前焦点层，缺省即本人所在层）；层徽、座位层徽、行动轴层徽、层标签、层塔里的层行带 `data-layer="0..4"`。「陀螺未停」据此在皮肤样式里重定义强调色与 `--ms-grade`；各层色值在 `theme/layerTints.ts`，并以 `--ms-totem-l1..4` 写进 `styles/index.css` 的令牌块（`themeCss.test.ts` 校验一致）。可单独关闭的装饰效果写成 `:root[data-fx-off~='<名字>']`，已用名字：`grid`、`totem`（陀螺旋转）、`flow`、`maze`（迷宫底纹）、`tint`（层级调色）。

**新增一个主题要动的地方：**

1. `theme/themes.ts` 的 `THEMES` 加主题（18 个令牌）+ `styles/index.css` 加同样的 `[data-theme='<id>']` 块 + 两份 i18n 的 `theme.names.<id>`（`themeCss.test.ts`、`themes.test.ts` 会检查一致性）
2. `styles/skins/<id>.css`：该主题对钩子类名的差异样式，并在 `styles/index.css` 里 `@import`
3. `components/MatchRuntime/stages/<id>/`：中央舞台组件（吃 `CenterStageProps`），需要背景氛围就再放一个 `Ambient` 组件
4. `theme/skins/<id>.ts`：登记 `ThemeSkin`（`React.lazy` 加载中央舞台、`center` 占位参数），并在 `theme/skins/index.ts` 的 `SKINS` 里加一项
5. 跑 `pnpm --filter @icgame/client test`：注册表、样式限定、颜色字面量等检查会替你兜底；然后按下面的清单走查

### 对局界面的约束

- 界面拿到的永远是**按座位裁剪的视图**（他人手牌只有张数、牌库只有张数），不要在界面里读完整状态才有的字段；本人座位取自来源接口，不得写死座位号（`MatchRuntime/noHardcodedSeat.test.ts` 会拦）
- 对局页的分流规则在 `pages/Game/resolveGameMode.ts`
- 选目标、响应类选择等交互由 `MatchDialogs` 承担（TargetPlayerPickerDialog、ShooterLayerPickerDialog、嫁接/万有引力/棋局易位等）；解封响应由布局内联承载（桌面 `desktop/ResponseWindow.tsx`，移动 `mobile/MobileResponseBar.tsx`，共用 `components/UnlockResponse/useUnlockResponse.ts`）；座位与行动轴节点只展示、不选目标
- 出牌是**两步**：点牌选中（读牌、看此刻能否打出），再点「打出」才进入出牌流程；弃牌阶段点牌切换选中
- 来源的 `kind` 是 `'local' | 'remote' | 'fixture'`：只有联机有截止时间、托管与重连；固定场景没有连接问题，响应窗口不会自动放弃，便于停在窗口上走查
- 状态双编码（颜色 + 文字 / 形状）、`:focus-visible` 可见、动画尊重 `prefers-reduced-motion`；颜色只用语义令牌类名，图标只用 `lucide-react`

**改 UI 时的自检清单：**

1. 访问 `/local` 确认新视觉生效；改动涉及连接状态、座位标识、等待提示时，再起服务端从好友房进一局联机对局确认
2. 访问 `/game/debug`、`/game/debug?as=master`、`/game/debug?pending=1` 确认三个固定场景都正常；改座位环或坞时再看 `/game/debug?players=4` 与 `?players=10`
3. 桌面 1024×768、1280×800、1440×900、1920×1080，移动 iPhone 12（390×844）都要走查：整页不滚动、座位不重叠、主操作按钮在视口内（`packages/e2e/tests/desktop-layout.spec.ts` 与 `mobile-layout.spec.ts` 守护）
4. 改了 `StageState` / 对局状态 `G` / 盘面模型，同步更新 `model/` 下的推导与测试，以及固定场景的构造
5. 改了钩子类名或皮肤样式，确认 `theme/skins/skins.test.ts` 通过

**交互硬规范：**

- 长按阈值：`lib/interactionConfig.ts` 的 `LONG_PRESS_MS = 2000ms`（桌面 + 移动统一）；双击 / 键盘同样打开详情（`hooks/useCardPressDetail.ts`）
- 金库牌 / 梦境层卡 **不触发**长按/双击详情（图案已明显）
- 金库翻开后的详情 **禁止翻面**（背面属游戏机密，`CardDetailModal.disableFlip = true`）
- 选目标统一走弹层（`TargetPlayerPickerDialog`），座位与行动轴节点 **只看不选**

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
