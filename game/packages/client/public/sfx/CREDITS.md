# 音效素材归档

> 每次新增/替换音效文件时必须同步更新本文件，并标明 **CC0** 或同等宽松协议的授权来源。
> 版权合规终检会扫描本文件对照 `SOUND_CATALOG` 登记的 key 是否一一匹配。

## 现状

**截至 2026-04-19，本目录未附带任何音效文件。** 代码已就位（`SOUND_CATALOG` + `AudioManager`），应用运行时因文件缺失会静默降级（不报错）。

部署/分发方可自行补齐本清单下的 4 段音效；所有文件**必须**为 CC0 或项目组原创声明为 CC0。

## 登记表

| 文件             | 来源 URL   | 作者       | 协议 | 备注           |
| ---------------- | ---------- | ---------- | ---- | -------------- |
| `dice-start.mp3` | _（待补）_ | _（待补）_ | CC0  | 掷骰开始 ~0.3s |
| `dice-land.mp3`  | _（待补）_ | _（待补）_ | CC0  | 落定 ~0.2s     |
| `victory.mp3`    | _（待补）_ | _（待补）_ | CC0  | 胜利 1-2s      |
| `defeat.mp3`     | _（待补）_ | _（待补）_ | CC0  | 失败 1-2s      |

## 补充指引

- **`freesound.org`**: 搜索时务必勾选 "Creative Commons 0"；下载后检查 Metadata 并截图存档
- **`pixabay.com/sound-effects/`**: 默认 Pixabay Content License，填入 "Pixabay Content License（等同 CC0）"
- **项目组自制**: 作者填"ICO 项目组"，协议 "CC0"

## 验收 checklist

- [ ] 4 段 MP3 文件已放入 `public/sfx/`
- [ ] 本文件 4 行登记均已填写（无 "（待补）"）
- [ ] 总体积 < 120 KB
- [ ] `SOUND_CATALOG` 的 4 个 key（dice-start / dice-land / victory / defeat）与文件名一一对应
- [ ] 源素材协议证明（截图/链接）已归档到公司/项目的私密存储
