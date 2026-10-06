import { describe, expect, it } from 'vitest';
import {
  RIDGE_LAYERS,
  deckPercent,
  occupantLine,
  ridgeShape,
  rowTag,
  vaultCaption,
} from './butterflyRows';

describe('山水长卷 · 金库题注', () => {
  it('已开：按内容写', () => {
    expect(vaultCaption({ opened: true, contentType: 'coin' })).toEqual({
      kind: 'opened',
      content: 'coin',
    });
  });

  it('未开但梦主知道内容：带上内容', () => {
    expect(vaultCaption({ opened: false, contentType: 'secret' })).toEqual({
      kind: 'known',
      content: 'secret',
    });
  });

  it('未开且内容未知：只说未开', () => {
    expect(vaultCaption({ opened: false, contentType: 'hidden' })).toEqual({ kind: 'closed' });
  });
});

describe('山水长卷 · 层标记', () => {
  it('解封进行中优先于本人所在层，再优先于焦点', () => {
    expect(rowTag({ unlocking: true, hasViewer: true }, true)).toBe('unlocking');
    expect(rowTag({ unlocking: false, hasViewer: true }, true)).toBe('here');
    expect(rowTag({ unlocking: false, hasViewer: false }, true)).toBe('focus');
    expect(rowTag({ unlocking: false, hasViewer: false }, false)).toBeNull();
  });
});

describe('山水长卷 · 牌库进度', () => {
  it('按剩余占总数取百分比，夹在 0–100', () => {
    expect(deckPercent(23, 60)).toBe(38);
    expect(deckPercent(60, 60)).toBe(100);
    expect(deckPercent(80, 60)).toBe(100);
    expect(deckPercent(0, 60)).toBe(0);
  });

  it('总数非法或剩余为负时为 0，有剩余时至少 1', () => {
    expect(deckPercent(5, 0)).toBe(0);
    expect(deckPercent(-3, 60)).toBe(0);
    expect(deckPercent(Number.NaN, 60)).toBe(0);
    expect(deckPercent(1, 1000)).toBe(1);
  });
});

describe('山水长卷 · 占位者', () => {
  it('各人用「 · 」连起来，本人写作 selfLabel', () => {
    expect(
      occupantLine(
        [
          { name: '白鸦', isSelf: false },
          { name: '阿波罗', isSelf: true },
        ],
        '我',
      ),
    ).toBe('白鸦 · 我');
    expect(occupantLine([], '我')).toBe('');
  });
});

describe('山水长卷 · 山形', () => {
  it('第 1–4 层各有一组山形，迷失层没有（山外是蝶）', () => {
    for (const layer of RIDGE_LAYERS) {
      const shape = ridgeShape(layer);
      expect(shape, `L${layer}`).not.toBeNull();
      // 填充是闭合路径，轮廓是开放路径
      expect(shape!.fill.trim().startsWith('M')).toBe(true);
      expect(shape!.fill.trim().endsWith('Z')).toBe(true);
      expect(shape!.line.trim().startsWith('M')).toBe(true);
      expect(shape!.line.trim().endsWith('Z')).toBe(false);
    }
    expect(ridgeShape(0)).toBeNull();
    expect(ridgeShape(9)).toBeNull();
  });

  it('各层山形互不相同', () => {
    const lines = RIDGE_LAYERS.map((l) => ridgeShape(l)!.line);
    expect(new Set(lines).size).toBe(RIDGE_LAYERS.length);
  });
});
