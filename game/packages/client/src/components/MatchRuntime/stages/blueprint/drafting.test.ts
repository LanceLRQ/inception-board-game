import { describe, expect, it } from 'vitest';
import {
  SLAB_CONTENT_INSET,
  SLAB_KINDS,
  SLAB_SKEW,
  SLAB_THICKNESS,
  SLAB_WIDTH,
  deckPercent,
  slabGeometry,
  slabKindOf,
} from './drafting';

type Pt = readonly [number, number];

function parse(points: string): Pt[] {
  return points.split(' ').map((p) => {
    const [x, y] = p.split(',').map(Number);
    return [x!, y!] as const;
  });
}

describe('slabGeometry', () => {
  it.each(SLAB_KINDS)('%s：顶面是四边形，上下两边等长，左右两边平行', (kind) => {
    const g = slabGeometry(kind);
    const [tl, tr, br, bl] = parse(g.top);
    expect(parse(g.top)).toHaveLength(4);
    // 上边与下边等长、都水平
    expect(tl![1]).toBe(tr![1]);
    expect(bl![1]).toBe(br![1]);
    expect(tr![0] - tl![0]).toBeCloseTo(br![0] - bl![0], 6);
    // 左右两边同样倾斜：顶边整体相对底边右移 SLAB_SKEW
    expect(tl![0] - bl![0]).toBe(SLAB_SKEW);
    expect(tr![0] - br![0]).toBe(SLAB_SKEW);
  });

  it.each(SLAB_KINDS)('%s：所有点都落在视窗之内（描边不被裁切）', (kind) => {
    const g = slabGeometry(kind);
    const [x0, y0, w, h] = g.viewBox.split(' ').map(Number);
    expect([x0, y0, w]).toEqual([0, 0, SLAB_WIDTH]);
    const all = [g.top, g.front, g.side].filter((s): s is string => s !== null).flatMap(parse);
    for (const [x, y] of all) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(w!);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(h!);
    }
  });

  it('普通层与焦点层有板厚：前面与右侧面紧贴顶面的下边与右边', () => {
    for (const kind of ['regular', 'focus'] as const) {
      const g = slabGeometry(kind);
      const [, tr, br, bl] = parse(g.top);
      const front = parse(g.front!);
      const side = parse(g.side!);
      // 前面：顶面下边向下拉出一个板厚
      expect(front[0]).toEqual(bl);
      expect(front[1]).toEqual(br);
      expect(front[2]![1] - br![1]).toBe(SLAB_THICKNESS);
      // 右侧面：顶面右边向下平移一个板厚
      expect(side[0]).toEqual(tr);
      expect(side[1]).toEqual(br);
      expect(side[3]![1] - tr![1]).toBe(SLAB_THICKNESS);
    }
  });

  it('迷失层是图面之外的虚线基础，没有板厚', () => {
    const g = slabGeometry('lost');
    expect(g.front).toBeNull();
    expect(g.side).toBeNull();
  });

  it('焦点层比普通层高，普通层比迷失层高', () => {
    const h = (k: (typeof SLAB_KINDS)[number]) => Number(slabGeometry(k).viewBox.split(' ')[3]);
    expect(h('focus')).toBeGreaterThan(h('regular'));
    expect(h('regular')).toBeGreaterThan(h('lost'));
  });

  it('内容内缩不小于倾斜量：板面内任意一段高度的内容，四个角都在斜切的左右边之内', () => {
    const inset = (SLAB_CONTENT_INSET / 100) * SLAB_WIDTH;
    for (const kind of SLAB_KINDS) {
      const [tl, tr, br, bl] = parse(slabGeometry(kind).top);
      const leftAt = (y: number) => bl![0] + ((y - bl![1]) / (tl![1] - bl![1])) * (tl![0] - bl![0]);
      const rightAt = (y: number) =>
        br![0] + ((y - br![1]) / (tr![1] - br![1])) * (tr![0] - br![0]);
      // 顶面高度范围内的各个高度：内缩后的左右边界不越过斜切的边
      for (let f = 0; f <= 1; f += 0.05) {
        const y = tl![1] + f * (bl![1] - tl![1]);
        expect(inset, `${kind} y=${y}`).toBeGreaterThanOrEqual(leftAt(y));
        expect(SLAB_WIDTH - inset, `${kind} y=${y}`).toBeLessThanOrEqual(rightAt(y));
      }
    }
  });
});

describe('slabKindOf', () => {
  it('焦点层、迷失层、普通层各归各类，焦点层优先（本人在迷失层时迷失层是焦点）', () => {
    expect(slabKindOf(0, 0)).toBe('focus');
    expect(slabKindOf(0, 2)).toBe('lost');
    expect(slabKindOf(2, 2)).toBe('focus');
    expect(slabKindOf(3, 2)).toBe('regular');
  });
});

describe('deckPercent', () => {
  it('按比例取整并夹在 0 到 100 之间', () => {
    expect(deckPercent(23, 60)).toBe(38);
    expect(deckPercent(60, 60)).toBe(100);
    expect(deckPercent(0, 60)).toBe(0);
    expect(deckPercent(70, 60)).toBe(100);
    expect(deckPercent(-3, 60)).toBe(0);
  });

  it('总数为 0 或不是有限数时是 0', () => {
    expect(deckPercent(5, 0)).toBe(0);
    expect(deckPercent(Number.NaN, 10)).toBe(0);
    expect(deckPercent(5, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
