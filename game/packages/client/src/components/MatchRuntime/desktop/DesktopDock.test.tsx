import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MatchController } from '../controllerTypes';
import { DesktopDock } from './DesktopDock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../shared/HandSelection', () => ({
  useHandSelection: () => ({ readingItem: null, select: vi.fn() }),
}));

describe('空手牌操作区', () => {
  it.each([
    ['draw', 'action-draw'],
    ['action', 'action-end'],
    ['discard', 'action-skip-discard'],
  ])('%s 阶段操作位于空手牌中央，技能在主操作之前', (phase, actionId) => {
    const controller = {
      hand: { available: true, items: [], overflow: 0, mustDiscard: false },
      turn: { isMine: true, phase },
      winner: null,
      skillPanel: null,
      entries: [],
      actions: { canConfirmDiscard: false, discardSelected: 0, discardRequired: 0 },
      preview: {},
      play: {},
    } as unknown as MatchController;
    const html = renderToStaticMarkup(<DesktopDock controller={controller} />);
    const emptyStart = html.indexOf('class="tabletop-hand-empty"');
    const skillStart = html.indexOf('data-testid="dock-skill"');
    const actionStart = html.indexOf(`data-testid="${actionId}"`);
    expect(emptyStart).toBeGreaterThan(0);
    expect(skillStart).toBeGreaterThan(emptyStart);
    expect(actionStart).toBeGreaterThan(skillStart);
    expect(html.slice(actionStart)).toContain('class="tabletop-primary');
    expect(html.match(/data-testid="dock-ops"/g)).toHaveLength(1);
    expect(html).not.toContain('点选手牌');
  });

  it('其他玩家的回合不显示结束行动或跳过弃牌', () => {
    const controller = {
      hand: { available: true, items: [], overflow: 0, mustDiscard: false },
      turn: { isMine: false, phase: 'action' },
      winner: null,
      skillPanel: null,
      entries: [],
      actions: {},
      preview: {},
      play: {},
    } as unknown as MatchController;
    const html = renderToStaticMarkup(<DesktopDock controller={controller} />);
    expect(html).not.toContain('data-testid="action-end"');
    expect(html).not.toContain('data-testid="action-skip-discard"');
  });
});
