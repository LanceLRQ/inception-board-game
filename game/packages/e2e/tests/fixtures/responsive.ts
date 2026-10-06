// 响应式与触控目标 E2E 的共用工具：整页滚动检查、包围盒重叠、长按阈值、触控目标审计

import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 两个包围盒是否相交（贴边不算） */
export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - 0.5 &&
    b.x < a.x + a.width - 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    b.y < a.y + a.height - 0.5
  );
}

/** 整页没有滚动条：内容宽高都不超过视口 */
export async function expectNoPageScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    sh: document.documentElement.scrollHeight,
    ch: document.documentElement.clientHeight,
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(m.sw, `横向无滚动条（scrollWidth ${m.sw} / clientWidth ${m.cw}）`).toBeLessThanOrEqual(
    m.cw,
  );
  expect(m.sh, `纵向无滚动条（scrollHeight ${m.sh} / clientHeight ${m.ch}）`).toBeLessThanOrEqual(
    m.ch,
  );
}

/**
 * 长按阈值（毫秒）：直接读客户端的交互配置，用例里不另写数字。
 * e2e 包的 rootDir 不含客户端源码，所以按文本取值而不是 import。
 */
export function readLongPressMs(): number {
  const source = readFileSync(
    new URL('../../../client/src/lib/interactionConfig.ts', import.meta.url),
    'utf8',
  );
  const match = /export const LONG_PRESS_MS\s*=\s*(\d+)/.exec(source);
  if (!match) throw new Error('interactionConfig.ts 里找不到 LONG_PRESS_MS');
  return Number(match[1]);
}

/** 触控目标的最小边长（CSS 像素） */
export const MIN_TOUCH_TARGET = 44;

export interface SmallTarget {
  readonly el: string;
  /** 命中区（包围盒外扩 16px 内逐点探测，落在元素自身上的点的包围盒） */
  readonly hit: string;
  readonly box: string;
  readonly reason: 'small' | 'covered';
  readonly covered?: string;
}

/**
 * 触控目标审计：返回命中区小于 44×44（或被别的可交互元素盖住一部分）的可交互元素。
 *
 * 命中区用 elementFromPoint 逐点探测，伪元素扩展、overflow 裁剪、被相邻元素盖住都如实反映，
 * 所以靠 padding / min-h / 伪元素扩大点击区域都算数。
 * 有打开的对话框时只审计对话框内（遮罩之下的内容点不到）。
 *
 * 豁免（在页面内判定，原因写在这里）：
 *   - 行内文字链接：夹在正文里的链接（父元素的文字比链接自己多），按 WCAG 2.5.8 的行内例外不要求尺寸；
 *   - 「跳到主内容」链接：平时在屏幕外，只在键盘聚焦时出现；
 *   - 不可见或已被 aria-hidden / inert 的元素；
 *   - 已禁用且 pointer-events 为 none 的元素按自身包围盒量（点不到，但仍应够大，保持聚焦态一致）。
 */
export async function auditTouchTargets(page: Page): Promise<SmallTarget[]> {
  return page.evaluate((MIN) => {
    const PAD = 16;
    const SEL =
      'button, a[href], [role=button], [role=radio], [role=switch], [role=tab], [role=checkbox], [role=menuitem], [role=option], [role=slider], input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    const modal = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')]
      .filter((d) => d.getAttribute('data-state') !== 'closed')
      .pop();
    const root = modal ?? document.body;
    const all = [...root.querySelectorAll(SEL)];
    const interactive = new Set(all);
    const label = (el: Element): string =>
      (el.getAttribute('data-testid') ? `#${el.getAttribute('data-testid')} ` : '') +
      (el.getAttribute('aria-label') || el.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 24) +
      ` <${el.tagName.toLowerCase()}>`;
    const out: SmallTarget[] = [];
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (el.closest('[aria-hidden=true], [inert]')) continue;
      if (el.classList.contains('skip-to-main')) continue;
      if (el.getBoundingClientRect().width === 0 || el.getBoundingClientRect().height === 0) {
        continue;
      }
      if (el.tagName === 'A' && cs.display === 'inline') {
        const parentText = (el.parentElement?.textContent ?? '').replace(/\s+/g, '');
        const ownText = (el.textContent ?? '').replace(/\s+/g, '');
        if (parentText.length > ownText.length + 2) continue;
      }
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const x0 = Math.max(0, Math.floor(r.left - PAD));
      const x1 = Math.min(innerWidth - 1, Math.ceil(r.right + PAD));
      const y0 = Math.max(0, Math.floor(r.top - PAD));
      const y1 = Math.min(innerHeight - 1, Math.ceil(r.bottom + PAD));
      let minX = 1e9;
      let maxX = -1;
      let minY = 1e9;
      let maxY = -1;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = document.elementFromPoint(x, y);
          if (t && (t === el || el.contains(t))) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const hitW = maxX < 0 ? 0 : maxX - minX + 1;
      const hitH = maxY < 0 ? 0 : maxY - minY + 1;
      // 被别的可交互元素盖住自身的一部分（相邻目标的命中区重叠）
      let covered: string | undefined;
      const stepX = Math.max(1, Math.floor(r.width / 6));
      const stepY = Math.max(1, Math.floor(r.height / 6));
      for (
        let y = Math.max(0, r.top + 1);
        y < Math.min(innerHeight, r.bottom - 1) && !covered;
        y += stepY
      ) {
        for (let x = Math.max(0, r.left + 1); x < Math.min(innerWidth, r.right - 1); x += stepX) {
          const t = document.elementFromPoint(x, y);
          if (!t || t === el || el.contains(t) || t.contains(el)) continue;
          const c = t.closest(SEL);
          if (c && c !== el && interactive.has(c) && !el.contains(c) && !c.contains(el)) {
            covered = label(c);
            break;
          }
        }
      }
      const dead = cs.pointerEvents === 'none';
      const w = dead ? r.width : hitW;
      const h = dead ? r.height : hitH;
      const common = {
        el: label(el),
        hit: `${Math.round(w)}x${Math.round(h)}`,
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      };
      if (w < MIN || h < MIN) out.push({ ...common, reason: 'small' });
      else if (covered) out.push({ ...common, reason: 'covered', covered });
    }
    return out;
  }, MIN_TOUCH_TARGET);
}
