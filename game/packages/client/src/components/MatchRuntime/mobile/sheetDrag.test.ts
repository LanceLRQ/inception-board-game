import { describe, it, expect } from 'vitest';
import { SHEET_DRAG_DISTANCE, sheetDragOutcome } from './sheetDrag';

describe('sheetDragOutcome', () => {
  it('收起态：向上拖够距离展开，向下拖或距离不够不动', () => {
    expect(sheetDragOutcome({ open: false, movementY: -SHEET_DRAG_DISTANCE, velocityY: 0 })).toBe(
      'open',
    );
    expect(sheetDragOutcome({ open: false, movementY: -10, velocityY: 0.1 })).toBeNull();
    expect(sheetDragOutcome({ open: false, movementY: 80, velocityY: 1 })).toBeNull();
  });

  it('展开态：向下拖够距离收起，向上拖不动', () => {
    expect(sheetDragOutcome({ open: true, movementY: SHEET_DRAG_DISTANCE, velocityY: 0 })).toBe(
      'close',
    );
    expect(sheetDragOutcome({ open: true, movementY: -80, velocityY: 1 })).toBeNull();
  });

  it('快速轻扫：距离不够但速度够也生效', () => {
    expect(sheetDragOutcome({ open: false, movementY: -15, velocityY: 0.8 })).toBe('open');
    expect(sheetDragOutcome({ open: true, movementY: 15, velocityY: 0.8 })).toBe('close');
    expect(sheetDragOutcome({ open: true, movementY: 4, velocityY: 0.8 })).toBeNull();
  });
});
