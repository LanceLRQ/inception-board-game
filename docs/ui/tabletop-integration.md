# 正式牌桌接入记录

> 本文为首次接入的历史记录。2026-11-03 复审确认尚未完整对齐 demo，且发现详情全文与梦主分类遗漏；后续以 [完整对齐方案与 checklist](tabletop-demo-parity-plan.md) 为准。下文已有测试结果不代表 UI 还原验收通过。

2026-11-03。将已确认的暗色牌桌原型接入正式客户端的共享 MatchRuntime。本地 Worker、联机来源、固定场景仍使用同一个控制层。没有修改游戏引擎、服务端信息裁剪、随机骰点、数据库或网络协议。

## 已接入

- 桌面：三栏牌桌、当前行动者置顶的玩家列表、回合轮转布局动画；左栏保留身份标识、应答状态、手牌数量和聊天气泡。中间层数卡使用原卡提取的底纹与透明数字；头像圆形显示并提供 tooltip，心锁用骰子表示。
- 多金库：每座金库有独立入口，翻面只依据视图的 contentType 展示；hidden 始终显示背面，已知内容标注仅你可见，公开金库标注已公开。梦魇入口继续保留。移动端直接打开原卡详情，避免窄横条裁剪卡面。
- 手牌：保留真实两步出牌、角色技能、复活、梦主移动、弃牌校验。桌面点选牌后右栏显示原卡和全文；点击卡图打开解析。出牌按钮在手牌操作区，未选牌不显示；确认弃牌按钮在选牌后出现。回合、阶段或手牌位置变化使旧选中状态失效。
- 手机：390 CSS px 起，四层纵向横条、五列手牌；超过五张按四列换行。移除重复层级标签，无人迷失时收起空迷失层。较多手牌、响应内容和玩家列表使用内部滚动。横屏保留左右布局。更小设备不纳入本次验收。
- 说明书：固定外框，桌面分类／目录／全文三栏，手机目录与阅读切换。完整 103 个原版牌面、9 章说明书；搜索名称与全文，表格单独横滑，原卡可以放大，返回目录保留列表位置。正式新手引导仍保留。
- 终局：可以收起结算回看牌桌、金库与说明书，再打开结算和举报入口。

## 素材与实现范围

`public/tabletop/layers/` 的八个 WebP 来自已确认原型的原卡像素提取；纹理和透明数字没有重新生图或染色。`public/tabletop/environment/` 的四个 WebP 来自此前已生成的城市、绒面和黄铜材质。完整原版卡图继续从 `public/cards/` 读取，通过正式素材清单生成带哈希的 URL，未复制或改写原卡。

主要实现：`components/MatchRuntime/desktop/`、`mobile/`、`stages/table/`、`shared/MatchOutcome.tsx`、`components/GameGuide/`、`styles/tabletop.css`。旧主题配色保留；桌面舞台采用统一牌桌，旧主题舞台模块保留在库中，不再由默认桌面对局挂载。原型及其固定骰点、演示局面状态没有引入正式游戏。

## 验证记录

- 客户端全量 Vitest：139 个测试文件，2336 项通过；新增说明书完整性检查覆盖所有牌面的正式素材映射与规则正文。
- 客户端 TypeScript、ESLint、Vite 生产构建通过。
- 浏览器：390×664、390×844、844×390、768×1024、1024×768、1440×900、1920×1080；没有页面横向溢出，手牌操作区在视口内。
- 固定场景：盗梦者、梦主、10 人、弃牌、解封应答、骰子待掷、终局收起后翻牌；桌面选牌同步右侧全文，弃牌选中后出现确认按钮，手机说明书内部滚动 700px 而外框仍为 370×824。
- 本地真实对局：创建四人局，等待本人回合，抽牌 0→2；选梦境穿梭剂、确认出牌、选择第二层后本人移层且手牌 2→1。
- 未执行真实多浏览器联机及 iPhone Safari 真机验收；界面接入共用来源接口，尚不能把这点等同于联机和真机回归已经完成。

构建保留既有 Vite 配置迁移提醒、coarse 变体 CSS 选择器警告、分包大小及 sourcemap／Browserslist 提醒，未扩展本次范围修改这些基础配置。修改已保存工作区，没有执行 Git 写操作。

## 文件清单

- [game/packages/client/src/components/MatchRuntime/desktop/DesktopDock.tsx:6](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/MatchRuntime/desktop/DesktopDock.tsx:6)
- [game/packages/client/src/components/MatchRuntime/desktop/DesktopLayout.tsx:9](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/MatchRuntime/desktop/DesktopLayout.tsx:9)
- [game/packages/client/src/components/MatchRuntime/desktop/DesktopStage.tsx:1](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/MatchRuntime/desktop/DesktopStage.tsx:1)
- [game/packages/client/src/components/MatchRuntime/desktop/DockOps.tsx:60](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/MatchRuntime/desktop/DockOps.tsx:60)
- [game/packages/client/src/components/MatchRuntime/mobile/DockOps.tsx:67](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/MatchRuntime/mobile/DockOps.tsx:67)
- [game/packages/client/src/components/MatchRuntime/mobile/MobileDock.tsx:112](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/MatchRuntime/mobile/MobileDock.tsx:112)
- [game/packages/client/src/components/MatchRuntime/mobile/MobileLayout.tsx:21](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/MatchRuntime/mobile/MobileLayout.tsx:21)
- [game/packages/client/src/components/MatchRuntime/shared/MatchOutcome.tsx:3](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/MatchRuntime/shared/MatchOutcome.tsx:3)
- [game/packages/client/src/components/MatchRuntime/stages/table/DreamLayerCard.tsx:1](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/MatchRuntime/stages/table/DreamLayerCard.tsx:1)
- [game/packages/client/src/components/MatchRuntime/stages/table/LayerCards.tsx:105](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/MatchRuntime/stages/table/LayerCards.tsx:105)
- [game/packages/client/src/styles/index.css:17](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/styles/index.css:17)
- [game/packages/client/src/components/GameGuide/index.tsx:1](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/GameGuide/index.tsx:1)
- [game/packages/client/src/components/GameGuide/content.json:1](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/GameGuide/content.json:1)
- [game/packages/client/src/components/GameGuide/content.test.ts:1](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/components/GameGuide/content.test.ts:1)
- [game/packages/client/src/styles/tabletop.css:1](/Volumes/Data/github/games/inception-board-game/game/packages/client/src/styles/tabletop.css:1)
