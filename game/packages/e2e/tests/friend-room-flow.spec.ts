// 好友房流程 E2E（Lobby → Room → 联机对局）
//
// 本用例用 page.route 拦截 /identity/* 与 /rooms/* 的后端调用，
// 验证前端 UI 流程（不依赖真实后端/Postgres/Redis）：
//   1. Lobby 未认证 → 输入昵称 → initIdentity
//   2. 已认证 → 创建房间 → 跳转 /room/:code
//   3. Room 页展示房间码 + 房主身份 + Start 禁用
//   4. 补 AI → 3 人 → Start 可点
//   5. 开始 → 进入联机对局页（没有真实 socket 服务端，只验证地址与容器）

import { test, expect, waitForAppReady } from './fixtures/index.js';

const API_BASE = 'http://localhost:3001';
const FAKE_TOKEN = 'fake-jwt';
const FAKE_PLAYER_ID = 'p-owner';
const FAKE_NICKNAME = '测试玩家';
const FAKE_CODE = 'TEST42';
const FAKE_ROOM_ID = 'm-test-42';

interface FakeRoom {
  id: string;
  code: string;
  ownerPlayerId: string;
  maxPlayers: number;
  ruleVariant: string;
  status: 'waiting' | 'playing' | 'finished';
  matchId?: string;
  players: Array<{
    playerId: string;
    nickname: string;
    avatarSeed: string;
    seat: number;
    isBot: boolean;
    joinedAt: number;
  }>;
}

function makeRoom(overrides: Partial<FakeRoom> = {}): FakeRoom {
  return {
    id: FAKE_ROOM_ID,
    code: FAKE_CODE,
    ownerPlayerId: FAKE_PLAYER_ID,
    maxPlayers: 6,
    ruleVariant: 'classic',
    status: 'waiting',
    players: [
      {
        playerId: FAKE_PLAYER_ID,
        nickname: FAKE_NICKNAME,
        avatarSeed: '123',
        seat: 0,
        isBot: false,
        joinedAt: Date.now(),
      },
    ],
    ...overrides,
  };
}

test.describe('好友房 Lobby / Room 流程', () => {
  test('未认证 → 初始化 → 创建房间 → Room 页', async ({ page }) => {
    let room: FakeRoom = makeRoom();

    // /identity/me：无 token 时前端会 skip；有 token 后任何时刻都返回当前用户
    let initialized = false;
    await page.route(`${API_BASE}/identity/me`, (r) => {
      if (!initialized) return r.fulfill({ status: 401 });
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          playerId: FAKE_PLAYER_ID,
          nickname: FAKE_NICKNAME,
          avatarSeed: '123',
          locale: 'zh-CN',
        }),
      });
    });

    await page.route(`${API_BASE}/identity/init`, (r) => {
      initialized = true;
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          playerId: FAKE_PLAYER_ID,
          nickname: FAKE_NICKNAME,
          token: FAKE_TOKEN,
          expiresAt: Date.now() + 86_400_000,
          recoveryCode: 'ABCD-1234',
          recoveryCodeWarning: '请妥善保存',
        }),
      });
    });

    await page.route(`${API_BASE}/rooms`, (r) => {
      if (r.request().method() !== 'POST') return r.continue();
      return r.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: room.id,
          code: room.code,
          ownerPlayerId: room.ownerPlayerId,
          maxPlayers: room.maxPlayers,
          currentPlayers: room.players.length,
          status: room.status,
          shortUrl: `/r/${room.code.toLowerCase()}`,
          expiresAt: Date.now() + 7_200_000,
        }),
      });
    });

    await page.route(`${API_BASE}/rooms/${FAKE_CODE}/join`, (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ room }),
      }),
    );

    await page.route(`${API_BASE}/rooms/${FAKE_CODE}/fill-ai`, (r) => {
      room = makeRoom({
        players: [
          ...room.players,
          {
            playerId: 'bot-1',
            nickname: 'AI Lv.1-1',
            avatarSeed: '1',
            seat: 1,
            isBot: true,
            joinedAt: Date.now(),
          },
          {
            playerId: 'bot-2',
            nickname: 'AI Lv.1-2',
            avatarSeed: '2',
            seat: 2,
            isBot: true,
            joinedAt: Date.now(),
          },
        ],
      });
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ room }),
      });
    });

    // 房间等待页的轮询查询：返回当前房间（开始之后带 playing 与对局号）
    await page.route(`${API_BASE}/rooms/code/${FAKE_CODE}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(room),
      }),
    );

    await page.route(`${API_BASE}/rooms/${FAKE_CODE}/start`, (r) => {
      room = { ...room, status: 'playing', matchId: FAKE_ROOM_ID };
      return r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ matchId: FAKE_ROOM_ID }),
      });
    });

    // 1. 进 Lobby，显示昵称输入
    await page.goto('/lobby');
    await waitForAppReady(page);

    await expect(page.getByLabel('先给自己起个名字')).toBeVisible({ timeout: 5_000 });

    // 2. 填昵称，点继续
    await page.getByLabel('先给自己起个名字').fill(FAKE_NICKNAME);
    await page.getByRole('button', { name: /继续/ }).click();

    // 3. 建档后先弹恢复码弹窗，确认保存后才进入创建/加入入口
    await expect(page.getByTestId('recovery-code-value')).toHaveText('ABCD-1234');
    await page.getByTestId('recovery-code-confirm').click();
    await expect(page.getByTestId('lobby-nickname')).toHaveText(FAKE_NICKNAME);
    await expect(page.getByTestId('lobby-create')).toBeVisible();

    // 4. 点"创建房间" → 跳 /room/:code
    await page.getByTestId('lobby-create').click();
    await page.waitForURL(`**/room/${FAKE_CODE}`, { timeout: 5_000 });

    // 5. Room 页展示房间码 + 房主身份
    await expect(page.getByTestId('room-copy')).toContainText(FAKE_CODE);
    await expect(page.getByTestId('room-count')).toContainText('1 / 6');

    // 此时 1 人 < 3 → Start 应禁用
    await expect(page.getByTestId('room-start')).toBeDisabled();

    // 6. 补 AI → 3 人
    await page.getByTestId('room-fill-ai').click();
    await expect(page.getByTestId('room-count')).toContainText('3 / 6', { timeout: 5_000 });

    // 7. Start 应可点
    await expect(page.getByTestId('room-start')).toBeEnabled();

    // 8. 点 Start → 真实后端路径：跳联机对局页，对局号取自开始接口的返回
    await page.getByTestId('room-start').click();
    await page.waitForURL(/\/game\/[^/?]+\?.*online=1/, { timeout: 5_000 });
    expect(new URL(page.url()).pathname).toBe(`/game/${FAKE_ROOM_ID}`);

    // 联机运行时容器挂载（无 socket 服务端，会停在连接中或重连横幅，这里不断言对局内容）
    await expect(page.getByTestId('remote-runtime')).toBeVisible({ timeout: 8_000 });
  });
});
