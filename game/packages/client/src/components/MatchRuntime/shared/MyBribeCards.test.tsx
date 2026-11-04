import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MatchView } from '@icgame/game-engine';
import { getCardImageUrl } from '../../../lib/cardImages';
import { BribeCardGallery } from '../../BribeCardGallery';
import { MyBribeCards } from './MyBribeCards';

const bribePool: MatchView['bribePool'] = [
  { id: 'mine-deal', heldBy: '1', status: 'dispatched', kind: 'deal' },
  { id: 'mine-fail', heldBy: '1', status: 'dispatched', kind: 'fail' },
  { id: 'other', heldBy: '2', status: 'dispatched', kind: null },
  { id: 'pool', heldBy: null, status: 'inPool', kind: null },
];

describe('本人贿赂牌入口', () => {
  it('只统计本人持有的牌，初始只展示张数，不暴露牌面与阵营', () => {
    const html = renderToStaticMarkup(<MyBribeCards view={{ bribePool }} viewerSeat="1" />);
    expect(html).toContain('贿赂牌（2）');
    expect(html).not.toMatch(/DEAL|成交|背叛|阵营|\/cards\/bribe\//);
    expect(html).not.toContain('role="dialog"');
  });

  it('成功与失败的入口完全一致', () => {
    const render = (kind: 'deal' | 'fail') =>
      renderToStaticMarkup(
        <MyBribeCards
          view={{ bribePool: [{ id: 'mine', heldBy: '1', status: 'dispatched', kind }] }}
          viewerSeat="1"
        />,
      );
    expect(render('deal')).toBe(render('fail'));
  });

  it('本人未收到牌时隐藏入口，即使别人持有或牌池还有牌', () => {
    expect(renderToStaticMarkup(<MyBribeCards view={{ bribePool }} viewerSeat="3" />)).toBe('');
  });

  it('没有对局视图时隐藏入口', () => {
    expect(renderToStaticMarkup(<MyBribeCards view={null} viewerSeat="1" />)).toBe('');
  });

  it('未授权的牌仅显示卡背，不输出成功、失败牌面或身份说明', () => {
    const html = renderToStaticMarkup(
      <BribeCardGallery bribes={[{ id: 'unknown', kind: null }]} />,
    );
    expect(html).toContain(getCardImageUrl('bribe_back'));
    expect(html).not.toContain(getCardImageUrl('bribe_success'));
    expect(html).not.toContain(getCardImageUrl('bribe_fail'));
    expect(html).not.toMatch(/DEAL|背叛|阵营/);
  });
});
