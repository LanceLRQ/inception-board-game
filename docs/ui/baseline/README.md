# UI demo 冻结基线

2026-11-03，初步接入提交 `3b39128` 之后、视觉重做之前。

- `demo/` 是已确认原型的完整副本，HTML、CSS、JS、原卡、头像、环境图均随 Git 保存。`manifest.json` 为逐文件 SHA-256；冻结后不再改动。
- 从仓库根目录执行 `python3 -m http.server 13001 --directory docs/ui/baseline/demo` 可独立复现。原型中的模拟控制仅用于基线，不进入正式包。
- 正式对照入口：`/game/debug?tabletop=normal|discard|peeked|dice|outcome`，固定六人及 demo 的角色、昵称、层数、锁数、五张／七张手牌。来源仍经 `viewMatch` 过滤，调试 move 不推进状态。
- `screenshots/` 保存 1440×900、390×844 的默认、选牌、弃牌、翻牌、目标、骰子、教程、终局共 32 张 WebP。捕获前等全部图片和字体加载；使用真实点击进入界面状态。

## 对照操作

| 状态 | demo | 正式 |
| --- | --- | --- |
| default | 重置 | tabletop=normal |
| selected | 选择第一张 SHOOT | normal，选择 SHOOT |
| target | 选择 SHOOT，打出 | normal，选择 SHOOT，打出 |
| discard | 局面演示 → 弃牌阶段 | tabletop=discard |
| flip | 初始局面，翻第三层 | normal，翻第三层 |
| dice | 顶栏掷骰演示 | tabletop=dice |
| guide | 教程入口 | 游戏教程说明书 |
| outcome | 秘密开启前，选择解封并打出 | tabletop=outcome |

初始截图记录旧正式版的缺陷，不是完成验收：玩家排序、素材展示面、布局、字体、弹层和滚动仍与 demo 不同。手机初始版点击层数会打开详情，demo 也有手机阅读逻辑，后续按手机规范调整。

骰子对照存在有意的机制差异：demo 是手动预览，正式场景由梦主真实打出 SHOOT 给本人，经过引擎形成掷骰闸门，背景行动者与牌库因此不同；只比较骰子舞台，不伪造正式骰点。终局正式引擎公开的信息比 demo 更多，必须保留权限规则。窥视场景的内容只对本人可见，已用另一座位的 viewMatch 验证。

## 验证记录

- `pnpm --dir game --filter @icgame/client typecheck`：通过。
- `pnpm --dir game --filter @icgame/client lint`：通过。
- `pnpm --dir game --filter @icgame/client exec vitest run src/match/fixtures/`：431 项通过，含新场景的引擎不变量、确定数据与隐私检查。
- `git diff --check`：通过。原有 Vite 配置兼容警告不属于此次改动。
- 后续各阶段截图单独保存，不覆盖本目录初始截图。

原型自带的 `state.test.mjs` 也原样冻结，其中素材对照测试依赖原目录的 `../../reference/`，不可在副本路径直接运行（会报 ENOENT）。已在源目录运行 `node --test docs/_internal/ui-demo/modern-tabletop/state.test.mjs`，10 项通过；副本的跨机器完整性以 `manifest.json` 校验，网页本身无此路径依赖。
