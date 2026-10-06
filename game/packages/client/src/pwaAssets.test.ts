// PWA 清单与页面头部引用的图标必须真实存在于 public/，否则安装到主屏时图标会 404
// 客户端包没有 Node 类型声明，这里用 Vite 的原文导入读取文件，用 glob 的键判断文件是否存在。

import { describe, expect, it } from 'vitest';
import manifestText from '../public/manifest.json?raw';
import viteConfigText from '../vite.config.ts?raw';
import indexHtml from '../index.html?raw';

const publicIcons = new Set(
  Object.keys(import.meta.glob('../public/*.{png,ico}')).map((p) => p.replace('../public/', '')),
);

function publicFileExists(urlPath: string): boolean {
  return publicIcons.has(urlPath.replace(/^\//, ''));
}

describe('PWA 图标资源', () => {
  it('manifest.json 里的每个图标都有对应文件', () => {
    const manifest = JSON.parse(manifestText) as { icons: { src: string }[] };
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(publicFileExists(icon.src), icon.src).toBe(true);
    }
  });

  it('构建配置里声明的图标都有对应文件', () => {
    const referenced = [...viteConfigText.matchAll(/['"](\/?[\w-]+\.(?:png|ico))['"]/g)].map(
      (m) => m[1]!,
    );
    expect(referenced.length).toBeGreaterThan(0);
    for (const file of new Set(referenced)) {
      expect(publicFileExists(file), file).toBe(true);
    }
  });

  it('index.html 引用的图标都有对应文件', () => {
    const hrefs = [...indexHtml.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map(
      (m) => /href="([^"]+)"/.exec(m[0])?.[1],
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).toBeDefined();
      expect(publicFileExists(href!), href).toBe(true);
    }
  });
});
