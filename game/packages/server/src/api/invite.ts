// 房间邀请链接：GET /invite/:code
//
// 把邀请链接贴进聊天软件时，对方的预览抓取器不执行页面脚本，单页应用的静态入口页给不出按房间定制的标题与缩略图。
// 所以邀请链接由服务端处理：
//   - 预览抓取器（按 User-Agent 识别）→ 返回只带 Open Graph / Twitter Card 标签的最小页面；
//   - 普通浏览器 → 302 到客户端的房间页 /room/:code。
//
// 卡片只用通用的标题与描述，最多带上房间码；不含房间里任何成员的昵称等信息。
// 房间不存在、已过期或查询失败时给不带房间码的通用卡片，不暴露错误细节。
// 不依赖数据库：房间状态读自大厅（Redis），无状态可缓存。

import Router from '@koa/router';
import type { LobbyService } from '../services/LobbyService.js';
import { logger } from '../infra/logger.js';

export interface InviteConfig {
  /** 站点对外地址（协议 + 域名 [+ 端口]，不带末尾斜杠）；不给时取请求的来源 */
  readonly publicBaseUrl?: string;
  /** 缩略图路径（站点根下的路径，或完整的 http(s) 地址） */
  readonly imagePath: string;
}

export const DEFAULT_INVITE_IMAGE_PATH = '/pwa-512x512.png';
/** 默认缩略图的像素尺寸；换了缩略图路径后尺寸未知，不写尺寸标签 */
const DEFAULT_IMAGE_SIZE = 512;

const ROOM_CODE_PATTERN = /^[A-Za-z0-9]{6}$/;

/** 常见聊天软件与搜索引擎的链接预览抓取器 */
const PREVIEW_BOT_PATTERN = new RegExp(
  [
    'facebookexternalhit',
    'facebot',
    'twitterbot',
    'slackbot',
    'slack-imgproxy',
    'linkedinbot',
    'whatsapp',
    'telegrambot',
    'discordbot',
    'pinterest',
    'googlebot',
    'bingbot',
    'applebot',
    'skypeuripreview',
    'vkshare',
    'redditbot',
    'embedly',
    'mastodon',
    'line-poker',
    'kakaotalk-scrap',
    'iframely',
    'yahoo link preview',
    'viber',
    'bitlybot',
    'tumblr',
    'quora link preview',
    'outbrain',
    'w3c_validator',
  ].join('|'),
  'i',
);

/** 是否是链接预览抓取器 */
export function isLinkPreviewBot(userAgent: string | undefined): boolean {
  return userAgent !== undefined && PREVIEW_BOT_PATTERN.test(userAgent);
}

/** HTML 属性与正文转义 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 从环境变量读邀请配置；站点地址非法时忽略并告警 */
export function inviteConfigFromEnv(env: NodeJS.ProcessEnv): InviteConfig {
  let publicBaseUrl: string | undefined;
  const rawBase = env.PUBLIC_BASE_URL?.trim();
  if (rawBase) {
    try {
      const url = new URL(rawBase);
      if (url.protocol === 'http:' || url.protocol === 'https:') publicBaseUrl = url.origin;
      else logger.warn('PUBLIC_BASE_URL 不是 http(s) 地址，已忽略');
    } catch {
      logger.warn('PUBLIC_BASE_URL 不是合法地址，已忽略');
    }
  }
  const rawImage = env.INVITE_IMAGE_PATH?.trim();
  const imagePath =
    rawImage && (rawImage.startsWith('/') || /^https?:\/\//i.test(rawImage))
      ? rawImage
      : DEFAULT_INVITE_IMAGE_PATH;
  return { ...(publicBaseUrl !== undefined ? { publicBaseUrl } : {}), imagePath };
}

export interface InviteCardInput {
  /** 站点根地址，不带末尾斜杠 */
  readonly baseUrl: string;
  /** 房间存在时的房间码；通用卡片为 null */
  readonly code: string | null;
  readonly imagePath: string;
}

/** 渲染分享卡片页面（所有动态内容都经过转义） */
export function renderInviteCard({ baseUrl, code, imagePath }: InviteCardInput): string {
  const siteName = '盗梦都市 · Inception City Online';
  const title = code === null ? `${siteName} · 好友房邀请` : `邀请你加入房间 ${code} · 盗梦都市`;
  const description =
    code === null
      ? '移动端优先的《盗梦都市》在线多人桌游。点开链接，输入房间码加入好友房。 Join a friend room of Inception City Online.'
      : `房间码 ${code}，点开链接即可加入这局《盗梦都市》。 Join room ${code} on Inception City Online.`;
  const pageUrl = code === null ? baseUrl : `${baseUrl}/invite/${code}`;
  const target = code === null ? `${baseUrl}/lobby` : `${baseUrl}/room/${code}`;
  const image = /^https?:\/\//i.test(imagePath) ? imagePath : `${baseUrl}${imagePath}`;
  const sized = imagePath === DEFAULT_INVITE_IMAGE_PATH;

  const meta: Array<[string, string, string]> = [
    ['name', 'description', description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', siteName],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', pageUrl],
    ['property', 'og:image', image],
    ...(sized
      ? ([
          ['property', 'og:image:width', String(DEFAULT_IMAGE_SIZE)],
          ['property', 'og:image:height', String(DEFAULT_IMAGE_SIZE)],
        ] as Array<[string, string, string]>)
      : []),
    ['name', 'twitter:card', 'summary'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', image],
  ];
  const tags = meta
    .map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}">`)
    .join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
${tags}
<link rel="canonical" href="${escapeHtml(pageUrl)}">
</head>
<body>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(target)}">${escapeHtml(siteName)}</a></p>
</body>
</html>
`;
}

export interface InviteRouterDeps {
  lobby: Pick<LobbyService, 'getRoom'>;
  config: InviteConfig;
}

/** 邀请路由（公开，不需要登录） */
export function createInviteRouter({ lobby, config }: InviteRouterDeps): Router {
  const router = new Router();

  router.get('/invite/:code', async (ctx) => {
    const rawCode = ctx.params.code ?? '';
    const code = ROOM_CODE_PATTERN.test(rawCode) ? rawCode.toUpperCase() : null;
    const baseUrl = config.publicBaseUrl ?? `${ctx.protocol}://${ctx.host}`;
    ctx.set('Vary', 'User-Agent');
    ctx.set('Cache-Control', 'private, no-cache');

    const preview = isLinkPreviewBot(ctx.get('user-agent'));
    if (!preview) {
      // 普通浏览器：交给客户端；站点地址没配置时用相对地址（与前端同源部署）
      const origin = config.publicBaseUrl ?? '';
      ctx.redirect(code === null ? `${origin}/lobby` : `${origin}/room/${code}`);
      return;
    }

    // 抓取器：房间存在才带房间码；查不到或查询出错都是通用卡片
    let cardCode: string | null = null;
    if (code !== null) {
      try {
        const room = await lobby.getRoom(code);
        if (room !== null && room.status === 'waiting') cardCode = code;
      } catch (err) {
        logger.warn({ err }, 'invite room lookup failed');
      }
    }
    logger.info({ preview: true, hasRoom: cardCode !== null }, 'invite card served');
    ctx.status = 200;
    ctx.type = 'text/html; charset=utf-8';
    ctx.body = renderInviteCard({ baseUrl, code: cardCode, imagePath: config.imagePath });
  });

  return router;
}
