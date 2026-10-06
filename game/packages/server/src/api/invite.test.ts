// 邀请链接：预览抓取器拿到分享卡片，浏览器被重定向；卡片不含成员信息，所有动态内容都转义

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Koa from 'koa';
import type { RoomState } from '../services/LobbyService.js';
import {
  DEFAULT_INVITE_IMAGE_PATH,
  createInviteRouter,
  escapeHtml,
  inviteConfigFromEnv,
  isLinkPreviewBot,
  renderInviteCard,
  type InviteConfig,
} from './invite.js';

vi.mock('../infra/logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let server: Server | null = null;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = null;
});

function room(over: Partial<RoomState> = {}): RoomState {
  return {
    id: 'r1',
    code: 'ABC234',
    ownerPlayerId: 'p1',
    maxPlayers: 6,
    ruleVariant: 'classic',
    exCardsEnabled: false,
    expansionEnabled: false,
    status: 'waiting',
    players: [
      {
        playerId: 'p1',
        nickname: '机密昵称甲',
        avatarSeed: '1',
        seat: 0,
        isBot: false,
        joinedAt: 1,
      },
    ],
    createdAt: 1,
    expiresAt: 2,
    ...over,
  };
}

interface Reply {
  status: number;
  headers: Headers;
  text: string;
}

async function get(
  path: string,
  opts: {
    ua?: string;
    getRoom?: (code: string) => Promise<RoomState | null>;
    config?: InviteConfig;
  } = {},
): Promise<Reply> {
  const app = new Koa();
  const router = createInviteRouter({
    lobby: { getRoom: opts.getRoom ?? (async () => room()) },
    config: opts.config ?? { imagePath: DEFAULT_INVITE_IMAGE_PATH },
  });
  app.use(router.routes());
  server = createServer(app.callback());
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    redirect: 'manual',
    headers: opts.ua === undefined ? {} : { 'user-agent': opts.ua },
  });
  return { status: res.status, headers: res.headers, text: await res.text() };
}

const FACEBOOK_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uagent.php)';
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

describe('isLinkPreviewBot', () => {
  it.each([
    FACEBOOK_UA,
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'TelegramBot (like TwitterBot)',
    'WhatsApp/2.23.20.0 A',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0)',
    'Mozilla/5.0 (Macintosh) Applebot/0.1',
  ])('识别抓取器：%s', (ua) => {
    expect(isLinkPreviewBot(ua)).toBe(true);
  });

  it('普通浏览器与缺失的 UA 不算抓取器', () => {
    expect(isLinkPreviewBot(CHROME_UA)).toBe(false);
    expect(isLinkPreviewBot(undefined)).toBe(false);
    expect(isLinkPreviewBot('')).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('转义五个特殊字符', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('inviteConfigFromEnv', () => {
  it('没有配置时用默认缩略图、不固定站点地址', () => {
    expect(inviteConfigFromEnv({})).toEqual({ imagePath: DEFAULT_INVITE_IMAGE_PATH });
  });

  it('站点地址只取来源（去掉路径与末尾斜杠）', () => {
    expect(inviteConfigFromEnv({ PUBLIC_BASE_URL: 'https://ico.example.com/some/path/' })).toEqual({
      publicBaseUrl: 'https://ico.example.com',
      imagePath: DEFAULT_INVITE_IMAGE_PATH,
    });
  });

  it('非法或非 http(s) 的站点地址被忽略；非法缩略图路径回落到默认', () => {
    expect(
      inviteConfigFromEnv({ PUBLIC_BASE_URL: 'javascript:alert(1)', INVITE_IMAGE_PATH: 'pic.png' }),
    ).toEqual({ imagePath: DEFAULT_INVITE_IMAGE_PATH });
    expect(inviteConfigFromEnv({ PUBLIC_BASE_URL: 'not a url' })).toEqual({
      imagePath: DEFAULT_INVITE_IMAGE_PATH,
    });
  });

  it('缩略图路径可以是站点根下的路径或完整地址', () => {
    expect(inviteConfigFromEnv({ INVITE_IMAGE_PATH: '/share.png' }).imagePath).toBe('/share.png');
    expect(
      inviteConfigFromEnv({ INVITE_IMAGE_PATH: 'https://cdn.example.com/a.png' }).imagePath,
    ).toBe('https://cdn.example.com/a.png');
  });
});

describe('renderInviteCard', () => {
  it('带房间码的卡片包含标题、描述、缩略图与链接地址', () => {
    const html = renderInviteCard({
      baseUrl: 'https://ico.example.com',
      code: 'ABC234',
      imagePath: DEFAULT_INVITE_IMAGE_PATH,
    });
    expect(html).toContain('og:title');
    expect(html).toContain('ABC234');
    expect(html).toContain('content="https://ico.example.com/pwa-512x512.png"');
    expect(html).toContain('content="https://ico.example.com/invite/ABC234"');
    expect(html).toContain('twitter:card');
    expect(html).toContain('og:image:width');
  });

  it('通用卡片不含房间码，缩略图是完整地址时原样使用且不写尺寸', () => {
    const html = renderInviteCard({
      baseUrl: 'https://ico.example.com',
      code: null,
      imagePath: 'https://cdn.example.com/a.png',
    });
    expect(html).not.toContain('/invite/');
    expect(html).toContain('content="https://cdn.example.com/a.png"');
    expect(html).not.toContain('og:image:width');
  });

  it('站点地址与缩略图路径里的特殊字符一律转义', () => {
    const html = renderInviteCard({
      baseUrl: 'https://x.test"><script>alert(1)</script>',
      code: null,
      imagePath: '/a"onerror="x.png',
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/content="[^"]*"onerror=/);
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('GET /invite/:code', () => {
  it('抓取器：200 与卡片，带房间码，不含成员昵称', async () => {
    const res = await get('/invite/abc234', { ua: FACEBOOK_UA });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('vary')).toContain('User-Agent');
    expect(res.text).toContain('og:title');
    expect(res.text).toContain('ABC234');
    expect(res.text).not.toContain('机密昵称甲');
  });

  it('抓取器：房间不存在、已开始或查询出错时给不带房间码的通用卡片', async () => {
    const missing = await get('/invite/ABC234', { ua: FACEBOOK_UA, getRoom: async () => null });
    expect(missing.status).toBe(200);
    expect(missing.text).not.toContain('ABC234');
    expect(missing.text).toContain('og:title');

    const started = await get('/invite/ABC234', {
      ua: FACEBOOK_UA,
      getRoom: async () => room({ status: 'playing' }),
    });
    expect(started.text).not.toContain('ABC234');

    const broken = await get('/invite/ABC234', {
      ua: FACEBOOK_UA,
      getRoom: async () => {
        throw new Error('redis down: secret-detail');
      },
    });
    expect(broken.status).toBe(200);
    expect(broken.text).not.toContain('secret-detail');
    expect(broken.text).not.toContain('ABC234');
  });

  it('抓取器：房间码格式不对时不查房间，给通用卡片', async () => {
    const getRoom = vi.fn(async () => room());
    const res = await get('/invite/<script>', { ua: FACEBOOK_UA, getRoom });
    expect(res.status).toBe(200);
    expect(getRoom).not.toHaveBeenCalled();
    expect(res.text).not.toContain('<script>');
  });

  it('浏览器：302 到房间页（房间码规范成大写），不查房间', async () => {
    const getRoom = vi.fn(async () => room());
    const res = await get('/invite/abc234', { ua: CHROME_UA, getRoom });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/room/ABC234');
    expect(getRoom).not.toHaveBeenCalled();
  });

  it('浏览器：配置了站点地址时重定向到绝对地址；房间码非法时回大厅', async () => {
    const config = { publicBaseUrl: 'https://ico.example.com', imagePath: '/x.png' };
    const ok = await get('/invite/ABC234', { ua: CHROME_UA, config });
    expect(ok.headers.get('location')).toBe('https://ico.example.com/room/ABC234');
    const bad = await get('/invite/nope', { ua: CHROME_UA, config });
    expect(bad.headers.get('location')).toBe('https://ico.example.com/lobby');
  });
});
