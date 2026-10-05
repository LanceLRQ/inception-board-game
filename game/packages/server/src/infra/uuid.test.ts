import { describe, expect, it } from 'vitest';
import { isUuid } from './uuid.js';

describe('isUuid', () => {
  it('接受大小写 UUID', () => {
    expect(isUuid('0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d')).toBe(true);
    expect(isUuid('0B1C2D3E-4F50-4A6B-8C7D-9E0F1A2B3C4D')).toBe(true);
  });
  it('拒绝其他字符串', () => {
    for (const bad of [
      '',
      'nope',
      'm-finished',
      '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4',
      '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4dd',
      ' 0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
    ]) {
      expect(isUuid(bad)).toBe(false);
    }
  });
});
