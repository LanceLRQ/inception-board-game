import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();

vi.mock('./api', () => {
  class ApiRequestError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { api: { get, post }, ApiRequestError };
});
vi.mock('./logger', () => ({
  logger: { flow: vi.fn(), warn: vi.fn(), error: vi.fn(), ai: vi.fn() },
}));

function stubLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  });
  return map;
}

const me = { playerId: 'p1', nickname: 'A', avatarSeed: '1' };

describe('roomApi', () => {
  beforeEach(() => {
    vi.resetModules();
    get.mockReset();
    post.mockReset();
    stubLocalStorage();
  });

  it('getRoom 走 GET /rooms/code/:code 并带回对局号', async () => {
    get.mockResolvedValue({ code: 'ABC234', status: 'playing', matchId: 'm-1', players: [] });
    const { roomApi } = await import('./roomApi');
    const room = await roomApi.getRoom('ABC234');
    expect(get).toHaveBeenCalledWith('/rooms/code/ABC234');
    expect(room.matchId).toBe('m-1');
  });

  it('startGame 走通真实后端时 online 为 true', async () => {
    post.mockResolvedValue({ matchId: 'm-2' });
    const { roomApi, isMockMode } = await import('./roomApi');
    await expect(roomApi.startGame('ABC234')).resolves.toEqual({ matchId: 'm-2', online: true });
    expect(isMockMode()).toBe(false);
  });

  it('后端不可达时降级为本地模拟：startGame 的 online 为 false，getRoom 读本地房间', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    get.mockRejectedValue(new TypeError('Failed to fetch'));
    const { roomApi, isMockMode } = await import('./roomApi');
    const created = await roomApi.createRoom(me, { maxPlayers: 4 });
    await roomApi.fillAI(created.code);
    const res = await roomApi.startGame(created.code);
    expect(res.online).toBe(false);
    expect(res.matchId).toBe(created.id);
    expect(isMockMode()).toBe(true);

    const room = await roomApi.getRoom(created.code);
    expect(room.status).toBe('playing');
    expect(room.players).toHaveLength(4);
  });

  it('模拟模式下查询不存在的房间会报 404', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    const { roomApi } = await import('./roomApi');
    await roomApi.createRoom(me);
    await expect(roomApi.getRoom('ZZZZZZ')).rejects.toMatchObject({ status: 404 });
  });

  it('真实请求成功过之后遇到网络错误：直接抛错，不切到本地模拟', async () => {
    get.mockResolvedValueOnce({ code: 'ABC234', status: 'waiting', players: [] });
    const { roomApi, isMockMode } = await import('./roomApi');
    await roomApi.getRoom('ABC234');

    get.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(roomApi.getRoom('ABC234')).rejects.toBeInstanceOf(TypeError);
    expect(isMockMode()).toBe(false);

    // 网络恢复后继续走真实后端
    get.mockResolvedValueOnce({ code: 'ABC234', status: 'playing', matchId: 'm-9', players: [] });
    await expect(roomApi.getRoom('ABC234')).resolves.toMatchObject({ matchId: 'm-9' });
  });

  it('真实请求成功过之后遇到 5xx 同样直接抛错', async () => {
    post.mockResolvedValueOnce({ matchId: 'm-1' });
    const { roomApi, isMockMode } = await import('./roomApi');
    await roomApi.startGame('ABC234');

    const { ApiRequestError } = await import('./api');
    get.mockRejectedValueOnce(new ApiRequestError(503, 'X', 'unavailable'));
    await expect(roomApi.getRoom('ABC234')).rejects.toMatchObject({ status: 503 });
    expect(isMockMode()).toBe(false);
  });
});
