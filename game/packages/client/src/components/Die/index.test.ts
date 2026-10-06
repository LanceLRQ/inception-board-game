import { describe, it, expect } from 'vitest';
import { pipSizeFor } from './index';

describe('pipSizeFor', () => {
  it('随骰子大小变化', () => {
    expect(pipSizeFor(16)).toBe(3);
    expect(pipSizeFor(64)).toBe(12);
  });

  it('最小 2 像素', () => {
    expect(pipSizeFor(4)).toBe(2);
  });
});
