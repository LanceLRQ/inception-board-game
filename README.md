# 盗梦都市 · Inception City Online

> 移动端优先的桌游《盗梦都市》在线复刻版
> Mobile-first online adaptation of the board game *Inception City*

一个由爱好者发起的非商业化在线复刻项目，支持人机对战、好友房、匿名身份与私有部署。

> 📜 本项目代码采用 MIT 协议开源；游戏素材版权归原桌游发行商所有，仅限爱好者非商业使用。完整条款见文末 [版权声明](#️-版权声明与使用说明--copyright--fair-use-notice) 与 [NOTICE](./NOTICE) 文件。

---

## 项目特性 · Features

- 🎮 51 个基础角色（36 盗梦者 + 15 梦主）+ 6 梦魇 + 20 行动牌
- 📱 移动端优先设计（PWA、竖屏、单手触达）
- 🤖 人机模式（纯本地运行，零服务器流量）
- 👥 好友房（6 位房间码 + QR 分享）
- 🔐 匿名身份（localStorage JWT + 跨设备恢复码）
- 🌐 Node.js + React + Boardgame.io 技术栈

## 游戏说明 · Game Manual

原版桌游规则说明存放于 [`docs/manual/`](./docs/manual/) 目录，包含：

- 游戏总览与组件清单
- 开局布置与流程说明
- 行动牌 / 盗梦者 / 梦主 / 梦魇能力详述
- 附录与致谢

## 私有部署 · Self-Hosting

本项目**明确支持个人/社区私有部署**，不锁定任何云厂商。

### 最小部署需求

| 组件 | 最低配置 | 推荐 |
|------|---------|------|
| CPU | 1 vCPU | 2 vCPU |
| 内存 | 512 MB | 1 GB |
| 磁盘 | 2 GB | 10 GB |
| Node.js | ≥ 20.x | 22.x LTS |
| PostgreSQL | ≥ 14 | 16 |
| Redis | ≥ 6 | 7 |

### Docker Compose 一键部署（推荐）

```bash
git clone https://github.com/<owner>/inception-board-game.git
cd inception-board-game
cp .env.example .env     # 修改必要的环境变量
docker-compose up -d
# 默认 http://localhost:3000
```

### 关键环境变量

```bash
# 基础
BASE_URL=https://your-domain.com        # 短链和分享链接的根域名
PORT=3000
NODE_ENV=production

# 数据库
DATABASE_URL=postgres://user:pass@localhost:5432/inception
REDIS_URL=redis://localhost:6379

# 身份安全
JWT_SECRET=<随机 64 字符>
RECOVERY_CODE_SALT=<随机 32 字符>

# 可选功能开关
ENABLE_ANALYTICS=false                   # Plausible 埋点，私有部署默认关
ENABLE_AI_LOCAL_UPLOAD=true              # 人机模式上传战绩
ENABLE_REPORT=true                       # 举报功能
```

### 自托管不等于商业部署

即便你私有部署，依然受本项目版权条款约束：**禁止任何商业化使用**（付费、广告、订阅等）。

详细部署文档：`docs/DEPLOYMENT.md`（后续补齐）

## 贡献 · Contributing

欢迎 Issue 与 PR！在提交代码前请阅读本文末版权声明及 [NOTICE](./NOTICE) 文件。

## 许可 · License

本项目采用**代码与素材分离的双重许可**：

| 部分 | 协议 | 说明 |
|------|------|------|
| 源代码 | [MIT License](./LICENSE) | 可自由使用、修改、商用（仅代码本身） |
| 游戏素材 | All Rights Reserved | 版权归原桌游《盗梦都市》发行商——**广州千骐动漫有限公司**，仅限爱好者非商业使用 |

This project uses a **dual licensing structure** separating code from game assets:

| Component | License | Notes |
|-----------|---------|-------|
| Source code | [MIT License](./LICENSE) | Free to use, modify, distribute — including commercially (code only) |
| Game assets | All Rights Reserved | Copyright of Guangzhou Qianqi Animation Co., Ltd. (publisher of *Inception City*). Fan-use only, non-commercial. |

---

## ⚠️ 版权声明与使用说明 · Copyright & Fair Use Notice

> 📄 本项目采用**代码与素材分离的双重许可结构**，完整法律声明见 [NOTICE](./NOTICE) 文件。

### 中文

本项目是**由爱好者发起的非商业化在线复刻**，仅供学习、交流与游戏玩法探讨使用。

#### 📦 代码部分 · Code

- **源代码**：采用 [MIT License](./LICENSE) 开源
- 代码部分本身（如房间系统、匿名身份、网络层实现、UI 组件等**不依赖原桌游素材的纯技术实现**）可被任何人自由使用、修改、商用
- 但注意：**整体发布运营本项目即视为使用了原桌游素材**，仍需遵守下方素材条款

#### 🎨 游戏素材部分 · Game Assets

**卡牌美术、卡牌文案、游戏规则、命名体系、世界观设计**：

- 版权归原桌游《盗梦都市》发行商——**广州千骐动漫有限公司**所有
- 本项目对上述素材的使用仅属于"爱好者作品 / Fan Project"范畴
- **严禁任何形式的商业化使用**（付费、广告、订阅、虚拟道具销售、捐赠变现等）
- 严禁在未经版权方书面许可的情况下将本项目（含素材）重新打包、分发、二次出版
- 如版权方认为本项目存在侵权或使用不当，请通过 Issue 联系我们，我们会第一时间配合处理（包括但不限于修改命名、替换美术素材、下架项目）

#### 💡 为什么代码用 MIT 但整体仍禁止商业化？

因为代码和素材是**两种不同的版权客体**：

- 代码选择 MIT 是为了最大化开源友好，方便开发者学习 Boardgame.io / 匿名身份 / PWA 等技术实现
- 真正阻止商业化的是**原桌游素材版权**——任何人想商用本项目完整形态，都必须先获得原桌游发行商（广州千骐动漫有限公司）的商业授权（本项目不提供这种授权）
- 如果你想基于本项目代码做**完全自研素材**的衍生作品（自己的卡牌/美术/规则），那代码 MIT 允许你这么做

#### 🚫 其他约束

- **本项目与原桌游发行商无任何商业关联与官方背书**
- 游玩或部署本项目 = **同意**上述全部条款

### English

This project is a **non-commercial fan-made online adaptation** of the board game *Inception City*, intended solely for learning, discussion, and gameplay exploration.

#### 📦 Code

- **Source code** is released under the [MIT License](./LICENSE).
- Purely technical components (room system, anonymous identity, networking, UI components — anything **not tied to the original board game's assets**) may be freely used, modified, and even used commercially.
- However: **publishing or operating this project as a whole means you are also using the original game's assets**, which are subject to the terms below.

#### 🎨 Game Assets

All **card artwork, card text, game rules, naming conventions, and worldview designs** remain the intellectual property of the original publisher — **Guangzhou Qianqi Animation Co., Ltd.** (广州千骐动漫有限公司).

- This project's use falls under fan-project fair use.
- **Any form of commercial use is strictly prohibited** (paid access, ads, subscriptions, in-game purchases, donation-for-access, etc.)
- Redistribution or repackaging of the project (including assets) without the publisher's written consent is prohibited.
- If the original publisher considers this project to be infringing or inappropriate, please contact us via GitHub Issues. We will cooperate immediately (including renaming, replacing art assets, or taking the project down).

#### 💡 Why MIT code but no commercial use overall?

Code and game assets are **two distinct copyright subjects**:

- MIT on the code maximizes open-source friendliness — developers can learn from the Boardgame.io, anonymous-identity, or PWA implementation.
- The real barrier to commercialization is the **original board game's asset copyright** — anyone wanting to monetize the complete project must first obtain commercial licensing from the original publisher (Guangzhou Qianqi Animation Co., Ltd.); this project does not grant such rights.
- You are welcome to build derivative works with **fully original assets** (your own cards, art, rules) on top of this codebase — MIT permits this.

#### 🚫 Other Constraints

- **No commercial affiliation with or endorsement from the original publisher.**
- **By playing or deploying this project, you agree to all terms above.**
