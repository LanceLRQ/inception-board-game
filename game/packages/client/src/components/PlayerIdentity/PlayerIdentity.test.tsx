import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerName } from './PlayerName';
import { PlayerAvatar } from './PlayerAvatar';

describe('玩家身份组件', () => {
  it('默认同时显示玩家名和角色名，缺少角色时保留玩家名', () => {
    const html = renderToStaticMarkup(
      <PlayerName name="Player 2" characterId="thief_space_queen" />,
    );
    expect(html).toContain('Player 2');
    expect(html).toContain('空间女王');
    expect(renderToStaticMarkup(<PlayerName name="Player 2" />)).not.toContain(' · ');
  });
  it('复用原型裁片，同时将角色说明回调与头像高亮状态保留在按钮', () => {
    const html = renderToStaticMarkup(
      <PlayerAvatar
        name="玩家"
        characterId="thief_space_queen"
        highlighted
        current
        onOpenCard={() => {}}
      />,
    );
    expect(html).toContain('/tabletop/portraits/thief_space_queen.webp');
    expect(html).toContain('data-highlighted="true"');
    expect(html).toContain('data-current="true"');
    expect(html).toContain('aria-label="查看玩家角色"');
    expect(html).not.toContain('disabled=""');
  });
  it('梦主横卡使用圆形裁切，未高亮头像不带高亮属性', () => {
    const html = renderToStaticMarkup(
      <PlayerAvatar name="梦主" characterId="dm_midsummer" onOpenCard={() => {}} />,
    );
    expect(html).toContain('data-master="true"');
    expect(html).not.toContain('data-highlighted');
  });
});
