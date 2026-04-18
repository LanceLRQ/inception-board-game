# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

**盗梦都市（Inception City Online / ICO）** —— 移动端优先的桌游《盗梦都市》在线多人复刻，PWA、匿名身份、支持私有部署。

- 玩家人数：3-10（默认 5-8，4 人有变体规则）
- 核心冲突：1 梦主 vs 多盗梦者（隐藏信息 + 非对称对抗）
- 当前阶段：**对外文档与素材就位，代码实现尚未启动**

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

## 常用命令

> 代码层尚未启动。代码层启动后，将追加：`pnpm dev` / `pnpm test` / `pnpm build` / `pnpm lint` / `docker-compose up`。届时请更新本节。

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

## 目录结构

```
.
├── LICENSE / NOTICE / README.md    # 入库的对外入口文件
├── docs/
│   └── manual/                     # 原版桌游规则说明
└── CLAUDE.md                       # 本文件
```
