import { describe, it, expect } from 'vitest';
import { CHAT_MESSAGE_ID_MAX_LENGTH, parseChatBroadcast } from './chatMessage.js';

describe('parseChatBroadcast', () => {
  it('接受形状正确的预设短语消息，只留协议里的字段', () => {
    const parsed = parseChatBroadcast('icg:chatBroadcast', {
      type: 'icg:chatBroadcast',
      scope: 'match',
      message: 'greet_hi',
      extra: 'dropped',
    });
    expect(parsed).toEqual({ type: 'icg:chatBroadcast', scope: 'match', message: 'greet_hi' });
  });

  it('不带 type 也接受（事件名已经说明了类型）', () => {
    expect(
      parseChatBroadcast('icg:chatBroadcast', { scope: 'match', message: 'greet_hi' }),
    ).toEqual({ type: 'icg:chatBroadcast', scope: 'match', message: 'greet_hi' });
  });

  it.each([
    ['载荷不是对象', 'greet_hi'],
    ['载荷为 null', null],
    ['载荷是数组', ['greet_hi']],
    ['type 与事件名不一致', { type: 'icg:move', scope: 'match', message: 'greet_hi' }],
    ['频道不是 match', { scope: 'room', message: 'greet_hi' }],
    ['缺 message', { scope: 'match' }],
    ['message 不是字符串', { scope: 'match', message: 12 }],
    ['message 为空串', { scope: 'match', message: '' }],
    ['message 超长', { scope: 'match', message: 'a'.repeat(CHAT_MESSAGE_ID_MAX_LENGTH + 1) }],
  ])('拒绝：%s', (_name, payload) => {
    expect(parseChatBroadcast('icg:chatBroadcast', payload)).toBeNull();
  });

  it('事件名不对返回 null', () => {
    expect(parseChatBroadcast('icg:heartbeat', { scope: 'match', message: 'greet_hi' })).toBeNull();
  });

  it('读属性时抛错也只是返回 null', () => {
    const evil = {
      get scope(): string {
        throw new Error('boom');
      },
    };
    expect(parseChatBroadcast('icg:chatBroadcast', evil)).toBeNull();
  });
});
