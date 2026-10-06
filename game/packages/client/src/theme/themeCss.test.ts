// 主题表与样式表的一致性：改了其中一边忘改另一边会被这里拦住

import { describe, expect, it } from 'vitest';
import css from '../styles/index.css?raw';
import { THEMES, THEME_IDS, TOKEN_NAMES, tokenVar } from './themes';

const norm = (v: string): string => v.replace(/\s+/g, ' ').trim();

/** 去掉注释，避免注释里的花括号干扰规则块匹配 */
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** 取出选择器里含指定片段的所有规则块的声明体 */
function ruleBodies(selectorPart: string): string[] {
  const bodies: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cssNoComments))) {
    if (m[1]!.includes(selectorPart)) bodies.push(m[2]!);
  }
  return bodies;
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const decl of body.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    map.set(decl.slice(0, idx).trim(), norm(decl.slice(idx + 1)));
  }
  return map;
}

describe('主题表与样式表一致', () => {
  for (const id of THEME_IDS) {
    it(`[data-theme='${id}'] 的 17 个令牌与主题表一致`, () => {
      const bodies = ruleBodies(`[data-theme='${id}']`);
      expect(bodies.length).toBeGreaterThan(0);
      const decls = declarations(bodies.join(';'));
      for (const name of TOKEN_NAMES) {
        expect(decls.get(tokenVar(name)), `${id} ${tokenVar(name)}`).toBe(
          norm(THEMES[id].tokens[name]),
        );
      }
    });
  }

  it(':root 上有一份缺省令牌，与默认主题一致', () => {
    const rootBodies = ruleBodies(':root').filter((b) => b.includes('--ms-bg'));
    expect(rootBodies.length).toBeGreaterThan(0);
    const decls = declarations(rootBodies.join(';'));
    for (const name of TOKEN_NAMES) {
      expect(decls.get(tokenVar(name)), tokenVar(name)).toBe(norm(THEMES.noir.tokens[name]));
    }
  });

  it('不再有 .dark 规则，暗色变体基于 data-scheme', () => {
    expect(cssNoComments).not.toMatch(/\.dark\s*\{/);
    expect(cssNoComments).not.toMatch(/\.dark\b/);
    const variant = cssNoComments.match(/@custom-variant dark\s*\(([^;]*)\);/);
    expect(variant).not.toBeNull();
    expect(variant![1]).toContain('data-scheme');
  });
});
