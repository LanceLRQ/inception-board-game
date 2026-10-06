import { beforeEach, describe, expect, it, vi } from 'vitest';

const { joinRoom, getRoom } = vi.hoisted(() => ({ joinRoom: vi.fn(), getRoom: vi.fn() }));

vi.mock('./roomApi', () => ({ roomApi: { joinRoom, getRoom } }));
vi.mock('./logger', () => ({
  logger: { flow: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { ApiRequestError } from './api';
import {
  ROOM_FALLBACK_POLL_MS,
  joinOrAttach,
  requestErrorMessage,
  roomKeys,
  roomPollInterval,
} from './roomQueries';

const me = { playerId: 'p1', nickname: 'A', avatarSeed: '1' };
const roomWith = (ids: string[]) => ({
  code: 'ABC234',
  players: ids.map((playerId) => ({ playerId })),
});

describe('roomKeys', () => {
  it('房间码统一成大写', () => {
    expect(roomKeys.detail('abc234')).toEqual(['room', 'ABC234']);
  });
});

describe('roomPollInterval', () => {
  it('推送连着时不轮询', () => {
    expect(roomPollInterval('connected', true)).toBe(false);
  });

  it.each(['idle', 'connecting', 'down'] as const)('推送 %s 时每 15 秒轮询', (status) => {
    expect(roomPollInterval(status, true)).toBe(ROOM_FALLBACK_POLL_MS);
    expect(ROOM_FALLBACK_POLL_MS).toBe(15_000);
  });

  it('页面不可见时一律暂停', () => {
    expect(roomPollInterval('down', false)).toBe(false);
    expect(roomPollInterval('connected', false)).toBe(false);
  });
});

describe('joinOrAttach', () => {
  beforeEach(() => {
    joinRoom.mockReset();
    getRoom.mockReset();
  });

  it('加入成功直接返回加入后的房间', async () => {
    joinRoom.mockResolvedValue(roomWith(['p1', 'p2']));
    await expect(joinOrAttach('ABC234', me)).resolves.toMatchObject({ code: 'ABC234' });
    expect(getRoom).not.toHaveBeenCalled();
  });

  it('加入失败但本人已在成员里（刷新页面）：按已加入处理', async () => {
    joinRoom.mockRejectedValue(new ApiRequestError(409, 'ROOM_STARTED', '游戏已开始'));
    const existing = roomWith(['p1']);
    getRoom.mockResolvedValue(existing);
    await expect(joinOrAttach('ABC234', me)).resolves.toBe(existing);
  });

  it('加入失败且本人不在成员里：抛出加入时的错误', async () => {
    const err = new ApiRequestError(409, 'ROOM_FULL', '房间已满');
    joinRoom.mockRejectedValue(err);
    getRoom.mockResolvedValue(roomWith(['p2']));
    await expect(joinOrAttach('ABC234', me)).rejects.toBe(err);
  });

  it('加入与查询都失败：抛出加入时的错误', async () => {
    const err = new ApiRequestError(404, 'NOT_FOUND', '房间不存在或已过期');
    joinRoom.mockRejectedValue(err);
    getRoom.mockRejectedValue(new ApiRequestError(500, 'X', 'x'));
    await expect(joinOrAttach('ABC234', me)).rejects.toBe(err);
  });
});

describe('requestErrorMessage', () => {
  it('请求错误取 message，其他转字符串', () => {
    expect(requestErrorMessage(new ApiRequestError(400, 'X', '不行'))).toBe('不行');
    expect(requestErrorMessage('boom')).toBe('boom');
  });
});
