import { describe, expect, it } from 'vitest';
import { THEMES, THEME_IDS } from '../../theme/themes';
import { THEME_MOTIFS, motifOf, previewStripe } from './preview';

describe('主题小预览', () => {
  it('每个主题都登记了示意图案，且没有多余的键', () => {
    expect(Object.keys(THEME_MOTIFS).sort()).toEqual([...THEME_IDS].sort());
  });

  it('五个主题的图案各不相同', () => {
    expect(new Set(THEME_IDS.map(motifOf)).size).toBe(THEME_IDS.length);
  });

  it('三段色依次取背景、面板、强调色令牌', () => {
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      expect(previewStripe(t)).toEqual([t.tokens.bg, t.tokens.panel, t.tokens.acc]);
    }
  });

  it('任意两个主题的三段色不完全相同', () => {
    const keys = THEME_IDS.map((id) => previewStripe(THEMES[id]).join('|'));
    expect(new Set(keys).size).toBe(THEME_IDS.length);
  });
});
