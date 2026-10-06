import { describe, expect, it } from 'vitest';
import { DECK_SEGMENTS, deckSegments, nodeNames, rowMarker, vaultCell } from './matrixRows';

describe('进程表 · 金库列', () => {
  it('未开且内容未知：封存', () => {
    expect(vaultCell({ opened: false, contentType: 'hidden' })).toEqual({ kind: 'sealed' });
  });

  it('未开但梦主知道内容：封存并带内容', () => {
    expect(vaultCell({ opened: false, contentType: 'coin' })).toEqual({
      kind: 'sealedKnown',
      content: 'coin',
    });
    expect(vaultCell({ opened: false, contentType: 'secret' })).toEqual({
      kind: 'sealedKnown',
      content: 'secret',
    });
  });

  it('已开：显示内容', () => {
    expect(vaultCell({ opened: true, contentType: 'coin' })).toEqual({
      kind: 'opened',
      content: 'coin',
    });
    expect(vaultCell({ opened: true, contentType: 'empty' })).toEqual({
      kind: 'opened',
      content: 'empty',
    });
  });
});

describe('进程表 · 状态标记', () => {
  const base = { unlocking: false, hasViewer: false };

  it('解封进行中优先，其次是本人所在层，再次是焦点层', () => {
    expect(rowMarker({ ...base, unlocking: true, hasViewer: true }, true)).toBe('unlocking');
    expect(rowMarker({ ...base, hasViewer: true }, true)).toBe('here');
    expect(rowMarker(base, true)).toBe('focus');
  });

  it('什么都不是时没有标记', () => {
    expect(rowMarker(base, false)).toBeNull();
    expect(rowMarker({ ...base, hasViewer: true }, false)).toBe('here');
  });
});

describe('牌库分格进度条', () => {
  it('满格、空格与四舍五入', () => {
    expect(deckSegments(60, 60)).toBe(DECK_SEGMENTS);
    expect(deckSegments(0, 60)).toBe(0);
    expect(deckSegments(30, 60)).toBe(DECK_SEGMENTS / 2);
    expect(deckSegments(23, 60)).toBe(Math.round((23 / 60) * DECK_SEGMENTS));
  });

  it('只剩一张牌也至少亮一格，总数无效或超出时夹在 0 与满格之间', () => {
    expect(deckSegments(1, 600)).toBe(1);
    expect(deckSegments(5, 0)).toBe(0);
    expect(deckSegments(Number.NaN, 60)).toBe(0);
    expect(deckSegments(90, 60)).toBe(DECK_SEGMENTS);
    expect(deckSegments(-3, 60)).toBe(0);
  });
});

describe('进程表 · 占位列', () => {
  it('本层各人用「 · 」连接，本人换成 selfLabel，没人为空串', () => {
    expect(nodeNames([], '我')).toBe('');
    expect(nodeNames([{ name: 'A', isSelf: false }], '我')).toBe('A');
    expect(
      nodeNames(
        [
          { name: 'A', isSelf: true },
          { name: 'B', isSelf: false },
        ],
        '我',
      ),
    ).toBe('我 · B');
  });
});
