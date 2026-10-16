import { describe, it, expect } from 'vitest';
import { centerOf, layerSelectors, seatSelectors } from './anchors';

describe('anchors', () => {
  it('本人的牌落在手牌坞，别人的落在座位牌或行动轴', () => {
    expect(seatSelectors('0', '0')).toEqual(['[data-testid="hand-dock"]']);
    expect(seatSelectors('2', '0')).toEqual([
      '[data-testid="player-seat-2"]',
      '[data-testid="rail-slot-2"]',
    ]);
  });

  it('层先找桌面中央舞台里的层卡片，再找移动层塔', () => {
    expect(layerSelectors(3)).toEqual([
      '[data-testid="center-stage"] [data-testid="layer-row-3"]',
      '[data-testid="layer-row-3"]',
    ]);
  });

  it('矩形中心', () => {
    expect(centerOf({ x: 10, y: 20, w: 100, h: 40 })).toEqual({ x: 60, y: 40 });
  });
});
