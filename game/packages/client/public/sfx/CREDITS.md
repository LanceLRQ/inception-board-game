# 音效素材归档

> 每次新增/替换音效文件时必须同步更新本文件，并标明 **CC0** 或同等宽松协议的授权来源。

## 现状

本目录附带 4 段音效，全部取自 Kenney（Kenney Vleugels，<https://kenney.nl>）以 CC0 1.0 发布的素材包，可用于个人与商业项目，不要求署名。
原始文件为 OGG，这里转成了 128 kbps 单声道 MP3；`dice-start.mp3` 另外截取了前 0.5 秒并加了淡出。4 段合计约 65 KB。

## 登记表

| 文件             | 素材包与原文件                        | 来源 URL                                 | 作者            | 协议    | 时长  |
| ---------------- | ------------------------------------- | ---------------------------------------- | --------------- | ------- | ----- |
| `dice-start.mp3` | Casino Audio 1.1 · `dice-shake-2.ogg` | <https://kenney.nl/assets/casino-audio>  | Kenney Vleugels | CC0 1.0 | 0.50s |
| `dice-land.mp3`  | Casino Audio 1.1 · `die-throw-4.ogg`  | <https://kenney.nl/assets/casino-audio>  | Kenney Vleugels | CC0 1.0 | 0.47s |
| `victory.mp3`    | Music Jingles · `jingles_STEEL02.ogg` | <https://kenney.nl/assets/music-jingles> | Kenney Vleugels | CC0 1.0 | 1.39s |
| `defeat.mp3`     | Music Jingles · `jingles_STEEL01.ogg` | <https://kenney.nl/assets/music-jingles> | Kenney Vleugels | CC0 1.0 | 1.38s |

协议全文：<https://creativecommons.org/publicdomain/zero/1.0/>（两个素材包自带的 `License.txt` 均写明 CC0）。

## 替换指引

- 只接受 CC0 或同等宽松、不要求署名的协议（见同目录 `README.md`）
- 文件名与 `src/lib/audio.ts` 的 `SOUND_CATALOG` 一一对应，替换时保持文件名不变
- 替换后更新上面的登记表
