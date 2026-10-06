// 房间页用例的共用桩：已登录的身份 + 拦截后端的房间接口（不依赖真实后端）
//
// 页面里的实时推送连不上这个假后端（拦截只作用于 HTTP），会自动退回轮询，页面行为不受影响。

import type { Page } from '@playwright/test';

export const API_BASE = 'http://localhost:3001';
export const ROOM_CODE = 'ABC234';
export const ME = { playerId: 'p-owner', nickname: '测试玩家' };

export interface FakeRoomPlayer {
  playerId: string;
  nickname: string;
  avatarSeed: string;
  seat: number;
  isBot: boolean;
  joinedAt: number;
}

export interface FakeRoom {
  id: string;
  code: string;
  ownerPlayerId: string;
  maxPlayers: number;
  ruleVariant: string;
  status: 'waiting' | 'playing' | 'finished';
  matchId?: string;
  players: FakeRoomPlayer[];
}

export function makeRoom(over: Partial<FakeRoom> = {}): FakeRoom {
  return {
    id: 'room-1',
    code: ROOM_CODE,
    ownerPlayerId: ME.playerId,
    maxPlayers: 6,
    ruleVariant: 'classic',
    status: 'waiting',
    players: [
      {
        playerId: ME.playerId,
        nickname: ME.nickname,
        avatarSeed: '123',
        seat: 0,
        isBot: false,
        joinedAt: 1,
      },
    ],
    ...over,
  };
}

/** 登录并让房间接口返回 getRoom() 给出的房间；返回记录各接口被调用次数的计数器 */
export async function mockRoomSession(
  page: Page,
  getRoom: () => FakeRoom = () => makeRoom(),
): Promise<{ polls: () => number }> {
  let polls = 0;
  await page.addInitScript(
    ([id, nickname]) => {
      try {
        localStorage.setItem('icgame-token', 'fake-jwt');
        localStorage.setItem(
          'icgame-identity',
          JSON.stringify({
            state: { playerId: id, token: 'fake-jwt', nickname, avatarSeed: 123 },
            version: 0,
          }),
        );
      } catch {
        /* 存储不可用时不登录 */
      }
    },
    [ME.playerId, ME.nickname] as const,
  );
  await page.route(`${API_BASE}/identity/me`, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        playerId: ME.playerId,
        nickname: ME.nickname,
        avatarSeed: '123',
        locale: 'zh-CN',
      }),
    }),
  );
  await page.route(`${API_BASE}/rooms/${ROOM_CODE}/join`, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ room: getRoom() }),
    }),
  );
  await page.route(`${API_BASE}/rooms/code/${ROOM_CODE}`, (r) => {
    polls += 1;
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(getRoom()),
    });
  });
  return { polls: () => polls };
}
