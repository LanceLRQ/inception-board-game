import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CARD_REFERENCES, GUIDE_CATEGORIES, guideEntries } from '../../lib/cardReference';
import { ReferenceText } from './ReferenceText';

describe('教程分类与共享全文', () => {
  it('每个目录分类都能访问预期牌面，没有落在目录外的卡牌', () => {
    const counts: Record<string, number> = {
      tutorial: 9,
      action: 21,
      thief: 42,
      'dream-master': 16,
      dream: 7,
      vault: 3,
      bribe: 3,
      nightmare: 7,
      other: 4,
    };
    const reachable = Object.keys(GUIDE_CATEGORIES).flatMap((id) => {
      const entries = guideEntries(id);
      expect(entries.length, id).toBe(counts[id]);
      return id === 'tutorial' ? [] : entries.map((entry) => entry.id);
    });
    expect(new Set(reachable)).toEqual(new Set(Object.keys(CARD_REFERENCES)));
  });
  it('搜索覆盖全文并忽略大小写、首尾空格，空结果不回退到其他分类', () => {
    expect(guideEntries('action', ' shoot ').some((c) => c.id === 'action_shoot')).toBe(true);
    expect(guideEntries('action', '金库').some((c) => c.id === 'action_dream_peek')).toBe(true);
    expect(guideEntries('dream-master', '不存在的条目')).toEqual([]);
  });
  it('渲染标题、表头与完整单元格，原文 HTML 作为文字转义', () => {
    const html = renderToStaticMarkup(
      <ReferenceText
        text={'## 测试标题\n\n| 一 | 二 |\n| --- | --- |\n| 甲 | 乙 |\n\n<script>alert(1)</script>'}
      />,
    );
    expect(html).toContain('<h3>测试标题</h3>');
    expect(html).toContain('<th scope="col">一</th>');
    expect(html).toContain('<td>乙</td>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
