# 梦境场景与组件材质

## 未采用的层数底纹试作

2026-11-02 曾试作共享灰度底纹；用户明确要求直接提取原卡颜色与透明数字后，该方案已撤下。最终素材见 [原卡提取记录](../layers/README.md)。以下仅保留试作来源与提示词，页面不再引用。

- 未采用的试作 WebP 已移除；不再使用共享调色底纹或文字数字。
- 原稿：`/Users/lancelrq/.codex/generated_images/01a19b61-9301-7940-89e3-7dd431f73d28/exec-f4517fa4-3292-43d5-8f5f-4e7482f78104.png`，1254 × 1254。
- 编码：`cwebp -q 78 -m 6 -resize 640 640`。未使用 CLI/API 生图回退。

最终提示词：

```text
Use case: precise-object-edit. Asset type: reusable background texture for responsive dream-layer game UI. Input image is a style reference and source of the abstract background ONLY. Reconstruct and expand its fine dreamlike interwoven curved linework, crossing translucent architectural planes, delicate engraved concentric wave patterns and tactile matte paper grain into a full-bleed square texture. Remove the large number 3 completely, remove its shadow, remove the black outside border, remove the tiny logo at bottom, remove ALL lettering, symbols and graphic objects. The whole image must be continuous texture, including the previously obscured center. Convert the material into neutral grayscale (light smoky silver and medium gray), modest contrast, no pure black or pure white regions, even illumination. Preserve the reference's layered geometric dream atmosphere, with quiet center and more visible curving geometry towards edges, but no intentional frame or empty rectangular card outline. Orthographic flat material only, no photographed card, no perspective, no bevel, no vignette. Tile-friendly edges. Do not generate a finished UI or any numbers. It will be colored separately with amber, cyan, mauve and gold tints and have a live numeral added by CSS.
```

2026-11-02，使用内置 image_gen 工具生成。仅作为独立 UI 原型的补充背景，不属于原版桌游素材，不替代或修改任何原卡。未使用 CLI/API 回退。

追加的 [table-felt.webp](table-felt.webp) 是独立牌桌绒面材质，512 × 512、1,164 字节，以 `cwebp -q 72 -m 6 -resize 512 512` 导出。牌桌已不使用城市图；城市图仅用于页面底层和弹层标题区。下方 56.8／23.5 KiB 为首批三张素材数据，追加绒面后的环境素材分别为 57.9／24.7 KiB，不含卡图与头像。

绒面原稿：`/Users/lancelrq/.codex/generated_images/01a19b61-9301-7940-89e3-7dd431f73d28/exec-705d048e-8745-4f15-b4c1-d2a8314ad34c.png`。

绒面最终提示词：

```text
Use case: stylized-concept. Asset type: a dedicated tabletop material background for a dark dream-heist board game, separate from its cinematic city environment. Create a square seamless top-down orthographic texture of deep charcoal-blue suede laid on a premium gaming table. Very fine tactile woven nap, subtle smoke-grey natural material variations, exceptionally low contrast, near-black base around #121a1d. Quiet, sophisticated and realistic, no visible large scratches. Completely uniform overhead illumination. No city, no architecture, no moon, no landscape, no objects, no playing cards, no dice, no symbols, no markings, no grids, no border, no bevel, no text or watermark. Entire frame is the raw flat fabric material, repeat-friendly edges, suitable as an unobtrusive background beneath colorful original playing cards, ivory dice and character portrait markers. Do not draw any UI.
```

## 成品与压缩

| 文件                                               | 尺寸       | 字节数 | 用途                       |
| -------------------------------------------------- | ---------- | ------ | -------------------------- |
| [dream-city-desktop.webp](dream-city-desktop.webp) | 1600 × 901 | 52984  | 桌面场景、牌桌、弹层标题区 |
| [dream-city-mobile.webp](dream-city-mobile.webp)   | 960 × 541  | 18924  | 1023px 及以下设备的场景    |
| [brushed-brass.webp](brushed-brass.webp)           | 384 × 384  | 5160   | 主操作按钮纹理             |

两张生成 PNG 原稿分别为 2253954 字节（1672 × 941）和 2176198 字节（1254 × 1254）。网页只引用 WebP。桌面新增素材合计 58144 字节（56.8 KiB），手机合计 24084 字节（23.5 KiB）；这是素材文件体积，不含 HTTP 开销、既有卡图，也不等于运行内存。相对两张原稿合计字节数分别减少约 98.7% 和 99.5%。

使用本机 cwebp：场景桌面 `-q 76 -m 6 -resize 1600 0`，场景手机 `-q 70 -m 6 -resize 960 0`，黄铜纹理 `-q 74 -m 6 -resize 384 384`。只做尺寸调整与 WebP 编码，没有额外重绘。多个组件共享同一场景 URL，由浏览器复用缓存；按 CSS 媒体查询选用场景尺寸，不新增持续动画、滤镜或 WebGL。

生成原稿保留在：

- `/Users/lancelrq/.codex/generated_images/01a19b61-9301-7940-89e3-7dd431f73d28/exec-b6a8fe68-0d38-4bb1-a453-273aa3cfe217.png`
- `/Users/lancelrq/.codex/generated_images/01a19b61-9301-7940-89e3-7dd431f73d28/exec-cd13f380-3b11-42aa-adc5-d7c2297284a5.png`

## 场景最终提示词

```text
Use case: stylized-concept. Asset type: landscape background painting for an interactive dark tabletop board game UI called Dream City, no UI drawn. Primary request: premium cinematic dream-heist atmosphere, an impossible folded city at night suspended over a dark obsidian tabletop plane. Wide 16:9 landscape composition. Weathered monumental urban towers bend subtly inward from the left and right outer edges, inverted architectural fragments above, thin atmospheric mist, distant warm amber windows and muted steel-blue reflected moonlight. The middle 60 percent and lower middle are calm dark charcoal negative space to support real playing cards and readable UI overlays. Architectural detail strongest near outer edges and upper third. Materials: realistic weathered concrete, black stone, fine tactile grain, restrained brushed-metal reflections; cinematic concept painting with highly considered textures rather than glossy CGI. Palette charcoal black, smoke grey, desaturated blue, tiny aged-brass highlights. Rich visible tonal detail but overall very dark, low contrast behind the central playing field. No text, typography, numbers, logos, playing cards, dice, people, buttons, interface mockup, neon purple, neon glow, lens flare, floating particles, high-contrast central focal object, borders or watermark. This is an original supplemental environment background, never a replacement for the game's original card art.
```

## 材质最终提示词

```text
Use case: stylized-concept. Asset type: seamless material texture for primary action buttons and a few active UI accents in a dark dream-heist tabletop game, NOT a rendered button. Generate a square flat orthographic macro swatch filling the entire image with one continuous warm champagne-brass surface. Restrained premium worn brass, fine horizontal brushed metal grain, tiny natural irregularities, subtle patina; matte satin finish, even soft illumination, medium-light golden beige base around #c9ae78. Consistent brightness across whole image so near-black lettering placed later remains readable. Very fine subtle texture, no strong scratches, no embossed motifs, no engraved symbols, no objects, no perspective, no bevel, no border, no frame, no vignette, no glare, no gradients, no text, no logo, no watermark. Repeat-friendly on all edges. This is a raw flat material bitmap, not a UI mockup.
```
