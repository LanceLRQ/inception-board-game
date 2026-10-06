// 防回退：对局相关源码里不能再出现写死的本人座位
// 客户端包没有 Node 类型声明，这里用 Vite 的原文导入读取源文件。
// 扫描范围：components/ 下与 pages/Game/ 下所有非测试源码。

import { describe, it, expect } from 'vitest';

const modules = import.meta.glob(
  [
    '../**/*.{ts,tsx}',
    '../../pages/Game/**/*.{ts,tsx}',
    '!../**/*.test.{ts,tsx}',
    '!../../pages/Game/**/*.test.{ts,tsx}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

// 这些文件里的 '0' 不是座位号，明确列出而不是放宽正则
const ALLOWED: Record<string, string> = {
  // 把查询参数 players 缺省解析为人数 0
  '../../pages/Game/resolveGameMode.ts': '人数默认值',
};

// 数组下标 ['0'] / 比较 === '0' / 属性 xxxID="0" / ={'0'} / ?? '0'，单双引号都算
const HARDCODED_SEAT = new RegExp(
  [
    String.raw`\[\s*['"]0['"]\s*\]`,
    String.raw`[=!]==?\s*['"]0['"]`,
    String.raw`(?:Player|Seat)ID\s*=\s*['"]0['"]`,
    String.raw`=\s*\{\s*['"]0['"]\s*\}`,
    String.raw`\?\?\s*['"]0['"]`,
  ].join('|'),
);

describe('对局界面不写死本人座位', () => {
  it('扫描范围内有源文件可检查', () => {
    expect(Object.keys(modules)).toEqual(
      expect.arrayContaining([
        './index.tsx',
        './useMatchController.ts',
        './model/viewAdapter.ts',
        './desktop/DesktopLayout.tsx',
        '../../pages/Game/index.tsx',
      ]),
    );
  });

  it('正则能识别各种写死形式', () => {
    for (const bad of [
      `const a = b['0'];`,
      `if (x === "0") {}`,
      `if (x !== '0') {}`,
      `<Seat viewerPlayerID="0" />`,
      `<Seat humanPlayerID={'0'} />`,
      `const id = mySeat ?? '0';`,
      `const id = mySeat ?? "0";`,
    ]) {
      expect(bad).toMatch(HARDCODED_SEAT);
    }
    expect(`const n = parseInt(x ?? '10', 10);`).not.toMatch(HARDCODED_SEAT);
  });

  for (const [file, text] of Object.entries(modules)) {
    if (file in ALLOWED) continue;
    it(`${file} 不含对座位 '0' 的写死比较或取值`, () => {
      expect(text).not.toMatch(HARDCODED_SEAT);
    });
  }
});
