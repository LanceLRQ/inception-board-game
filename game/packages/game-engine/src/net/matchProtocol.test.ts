import { describe, it, expect } from 'vitest';
import { parseClientMatchMessage, MATCH_PROTOCOL_VERSION } from './matchProtocol.js';

describe('parseClientMatchMessage', () => {
  // === icg:move 合法情况 ===

  it('should parse valid icg:move with intentId and stateID', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'playCard',
      args: [1, 'target'],
      intentId: 'intent-001',
      stateID: 42,
    });
    expect(result).toEqual({
      type: 'icg:move',
      move: 'playCard',
      args: [1, 'target'],
      intentId: 'intent-001',
      stateID: 42,
    });
  });

  it('should parse valid icg:move without optional stateID', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'endTurn',
      args: [],
      intentId: 'x',
    });
    expect(result).toEqual({
      type: 'icg:move',
      move: 'endTurn',
      args: [],
      intentId: 'x',
    });
  });

  it('should discard extra fields in icg:move', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'id1',
      extraField: 'should be ignored',
      anotherExtra: 123,
    });
    expect(result).toEqual({
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'id1',
    });
  });

  it('should shallow copy args array', () => {
    const argsInput = [1, { a: 2 }];
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'move1',
      args: argsInput,
      intentId: 'id2',
    });
    expect(result).not.toBeNull();
    if (result && result.type === 'icg:move') {
      expect(result.args).not.toBe(argsInput); // Different reference
      expect(result.args).toEqual(argsInput); // Same content
    }
  });

  // === icg:sync 合法情况 ===

  it('should parse valid icg:sync with explicit type', () => {
    const result = parseClientMatchMessage('icg:sync', { type: 'icg:sync' });
    expect(result).toEqual({ type: 'icg:sync' });
  });

  it('should parse valid icg:sync without payload', () => {
    const result = parseClientMatchMessage('icg:sync', undefined);
    expect(result).toEqual({ type: 'icg:sync' });
  });

  it('should parse valid icg:sync with null payload', () => {
    const result = parseClientMatchMessage('icg:sync', null);
    expect(result).toEqual({ type: 'icg:sync' });
  });

  it('should parse valid icg:sync with empty object', () => {
    const result = parseClientMatchMessage('icg:sync', {});
    expect(result).toEqual({ type: 'icg:sync' });
  });

  it('should discard extra fields in icg:sync payload', () => {
    const result = parseClientMatchMessage('icg:sync', {
      type: 'icg:sync',
      extra: 'field',
    });
    expect(result).toEqual({ type: 'icg:sync' });
  });

  // === intentId 校验 ===

  it('should reject intentId that is not a string', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 123,
    });
    expect(result).toBeNull();
  });

  it('should reject empty intentId', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: '',
    });
    expect(result).toBeNull();
  });

  it('should reject intentId longer than 64 characters', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'a'.repeat(65),
    });
    expect(result).toBeNull();
  });

  it('should accept intentId of exactly 1 character', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'a',
    });
    expect(result).not.toBeNull();
  });

  it('should accept intentId of exactly 64 characters', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'a'.repeat(64),
    });
    expect(result).not.toBeNull();
  });

  // === stateID 校验 ===

  it('should reject stateID that is not an integer', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'id1',
      stateID: 42.5,
    });
    expect(result).toBeNull();
  });

  it('should reject negative stateID', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'id1',
      stateID: -1,
    });
    expect(result).toBeNull();
  });

  it('should accept stateID of 0', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'id1',
      stateID: 0,
    });
    expect(result).not.toBeNull();
  });

  it('should accept positive integer stateID', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'id1',
      stateID: 999,
    });
    expect(result).not.toBeNull();
  });

  // === move 校验 ===

  it('should reject move that is not a string', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 123,
      args: [],
      intentId: 'id1',
    });
    expect(result).toBeNull();
  });

  // === args 校验 ===

  it('should reject args that is not an array', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: 'not an array',
      intentId: 'id1',
    });
    expect(result).toBeNull();
  });

  it('should accept empty args array', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'id1',
    });
    expect(result).not.toBeNull();
  });

  it('should accept args with various types', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:move',
      move: 'test',
      args: [1, 'string', true, null, { nested: 'object' }, [1, 2]],
      intentId: 'id1',
    });
    expect(result).not.toBeNull();
  });

  // === 不正确的 payload 类型 ===

  it('should return null if payload is not an object', () => {
    const result = parseClientMatchMessage('icg:move', 'string');
    expect(result).toBeNull();
  });

  it('should return null if payload is an array', () => {
    const result = parseClientMatchMessage('icg:move', [1, 2, 3]);
    expect(result).toBeNull();
  });

  it('should return null if payload is null for icg:move', () => {
    const result = parseClientMatchMessage('icg:move', null);
    expect(result).toBeNull();
  });

  it('should return null if payload is undefined for icg:move', () => {
    const result = parseClientMatchMessage('icg:move', undefined);
    expect(result).toBeNull();
  });

  // === 类型不匹配 ===

  it('should return null if payload.type does not match event name', () => {
    const result = parseClientMatchMessage('icg:move', {
      type: 'icg:sync',
      move: 'test',
      args: [],
      intentId: 'id1',
    });
    expect(result).toBeNull();
  });

  it('should return null if event name is icg:sync but payload.type is icg:move', () => {
    const result = parseClientMatchMessage('icg:sync', {
      type: 'icg:move',
      move: 'test',
      args: [],
      intentId: 'id1',
    });
    expect(result).toBeNull();
  });

  // === 未知事件名 ===

  it('should return null for unknown event name', () => {
    const result = parseClientMatchMessage('icg:unknown', {
      type: 'icg:unknown',
    });
    expect(result).toBeNull();
  });

  // === getter 抛异常 ===

  it('should catch exceptions when reading properties', () => {
    const payload = {
      get move() {
        throw new Error('getter error');
      },
    };
    const result = parseClientMatchMessage('icg:move', payload);
    expect(result).toBeNull();
  });

  it('should catch exceptions on any property', () => {
    const payload = {
      type: 'icg:move',
      move: 'test',
      get args() {
        throw new Error('args getter error');
      },
      intentId: 'id1',
    };
    const result = parseClientMatchMessage('icg:move', payload);
    expect(result).toBeNull();
  });

  // === 协议版本常量 ===

  it('should export MATCH_PROTOCOL_VERSION constant', () => {
    expect(MATCH_PROTOCOL_VERSION).toBe(1);
  });
});
