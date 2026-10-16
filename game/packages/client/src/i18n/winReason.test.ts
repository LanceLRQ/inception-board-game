// 胜负原因的文案：引擎可能给出的每种原因，两份语言文件都要有，界面不能显示原始键名
import { describe, it, expect } from 'vitest';
import { WIN_REASONS } from '@icgame/game-engine';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';

describe('胜负原因文案', () => {
  it.each([
    ['zh-CN', zhCN],
    ['en', en],
  ])('%s：与引擎的胜负原因一一对应', (_name, locale) => {
    const keys = Object.keys(
      (locale as { localMatch: { winReason: Record<string, string> } }).localMatch.winReason,
    ).sort();
    expect(keys).toEqual([...WIN_REASONS].sort());
  });
});
