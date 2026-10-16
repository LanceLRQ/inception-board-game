import { describe, it, expect } from 'vitest';
import { CUBE_FACES, cubeRotationFor } from './Die3D';

describe('cubeRotationFor', () => {
  it('转到每个点数时，那一面正对观察者（与该面自身的朝向相抵）', () => {
    for (const face of CUBE_FACES) {
      const r = cubeRotationFor(face.value);
      expect((r.x + face.x) % 360, `点数 ${face.value} 绕 X`).toBe(0);
      expect((r.y + face.y) % 360, `点数 ${face.value} 绕 Y`).toBe(0);
    }
  });

  it('六个面各是一个点数，不重复', () => {
    expect(CUBE_FACES.map((f) => f.value).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('不是 1-6 时按 1 处理', () => {
    expect(cubeRotationFor(9)).toEqual(cubeRotationFor(1));
  });
});
