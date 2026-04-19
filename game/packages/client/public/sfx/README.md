# 音效素材（`/sfx/`）

本目录存放游戏音效文件。代码通过 `lib/audio.ts` 的 `SOUND_CATALOG` 按 URL 访问；若文件缺失，应用会静默降级（不阻断）。

## 文件清单（共 4 段）

| 文件             | 用途             | 建议时长 | 建议大小 |
| ---------------- | ---------------- | -------- | -------- |
| `dice-start.mp3` | 掷骰开始的哗啦声 | ~0.3s    | < 20 KB  |
| `dice-land.mp3`  | 骰子落定的"咔"声 | ~0.2s    | < 15 KB  |
| `victory.mp3`    | 胜利结算音       | 1-2s     | < 40 KB  |
| `defeat.mp3`     | 失败结算音       | 1-2s     | < 40 KB  |

> 4 段合计建议 < 120 KB（含 precache SW 友好）。

## 许可要求

**必须使用 CC0 或同等宽松协议的素材。** 不接受 CC BY / CC BY-SA / 任何需要归属或复制权限的协议，原因：

- 游戏内播放时无法呈现 attribution
- 私有部署方需免许可证合规复用
- 简化版权终检

### 推荐来源

- [freesound.org](https://freesound.org/) — 过滤 "Creative Commons 0"
- [opengameart.org](https://opengameart.org/) — 过滤 "CC0"
- [Pixabay Sound Effects](https://pixabay.com/sound-effects/) — 默认 Pixabay Content License（免 attribution）
- 项目组自制并声明为 CC0

### 归档格式

每个 mp3 文件应配套登记到 `CREDITS.md`（见本目录同名文件）：

```
- dice-start.mp3 — <素材名称>（来源: <URL>, 作者: <作者>, 协议: CC0）
```

## 技术约定

- **格式**: 统一 MP3 (128 kbps, mono)
- **命名**: 全小写 + 连字符（kebab-case）
- **路径**: 相对 `/sfx/`（代码中 `SOUND_CATALOG` 硬编码）
- **缺失处理**: 代码捕获 `HTMLAudioElement.play()` reject，仅记 `console.warn`

## 开发者指引

**临时无音效开发**: 不放任何文件即可。音效会全部静音，但所有流程功能正常。
**添加新音效**: 先在 `src/lib/audio.ts` 的 `SOUND_CATALOG` 登记 key → URL，再放文件到本目录，最后更新 `CREDITS.md`。
