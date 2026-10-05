// 防回退：对局界面目录下的源码里不能再出现写死的本人座位
// 客户端包没有 Node 类型声明，这里用 Vite 的原文导入读取同目录源文件。

import { describe, it, expect } from 'vitest';

const modules = import.meta.glob(['./*.ts', './*.tsx', '!./*.test.ts', '!./*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('对局界面不写死本人座位', () => {
  it('目录下有源文件可检查', () => {
    expect(Object.keys(modules)).toEqual(
      expect.arrayContaining(['./index.tsx', './RuntimeStage.tsx', './viewAdapter.ts']),
    );
  });

  for (const [file, text] of Object.entries(modules)) {
    it(`${file} 不含对座位 '0' 的写死比较或取值`, () => {
      expect(text).not.toMatch(/\[\s*'0'\s*\]|===\s*'0'|!==\s*'0'/);
    });
  }
});
