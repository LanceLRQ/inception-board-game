// 跨域中间件：按白名单给 HTTP 响应补跨域头，不依赖第三方库
//
// 令牌走 Authorization 头而不是 cookie，所以不发 Access-Control-Allow-Credentials。

import type { Middleware } from 'koa';

/** 把配置（单个源、逗号分隔的字符串或数组）整理成源列表 */
export function parseOrigins(origin: string | string[]): string[] {
  const list = Array.isArray(origin) ? origin : origin.split(',');
  return list.map((o) => o.trim()).filter((o) => o.length > 0);
}

/**
 * 读 WS_CORS_ORIGIN。没配置（或为空）时返回空列表：不放行任何跨域源，只有同源页面能访问
 * （自带的 nginx 把前端与后端放在同一个域名下，不需要跨域）。前后端分域名部署时，把它设成前端页面的源。
 */
export function resolveCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  return parseOrigins(env.WS_CORS_ORIGIN ?? '');
}

/** 白名单里是否含 `*`（放行任意源） */
export function hasWildcardOrigin(origins: string[]): boolean {
  return origins.includes('*');
}

/** 生产环境下放行了任意源：启动时应打一条警告 */
export function isWildcardInProduction(
  origins: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === 'production' && hasWildcardOrigin(origins);
}

/**
 * socket.io 的跨域选项。没配置返回 undefined（不加任何跨域头，浏览器只会放行同源的长轮询请求）。
 * 令牌放在握手的 auth 载荷里而不是 cookie，所以跨站页面没有可借用的凭据；
 * WebSocket 本身不受浏览器跨域策略约束，凭令牌才能通过握手。
 */
export function socketCorsOptions(
  origin: string | string[] | undefined,
): { origin: string | string[]; credentials?: boolean } | undefined {
  const origins = origin === undefined ? [] : parseOrigins(origin);
  if (origins.length === 0) return undefined;
  // socket.io 的数组白名单只做逐项相等比较，不认 *，所以放行全部要写成字符串
  if (hasWildcardOrigin(origins)) return { origin: '*' };
  return { origin: origins, credentials: true };
}

export function corsMiddleware(origin: string | string[]): Middleware {
  const allowed = parseOrigins(origin);
  const allowAll = allowed.includes('*');

  return async (ctx, next) => {
    const requestOrigin = ctx.get('Origin');
    if (!requestOrigin) {
      await next();
      return;
    }

    if (allowAll) {
      ctx.set('Access-Control-Allow-Origin', '*');
    } else if (allowed.includes(requestOrigin)) {
      ctx.set('Access-Control-Allow-Origin', requestOrigin);
      ctx.vary('Origin');
    } else {
      await next();
      return;
    }

    // 预检：直接答复，不进入下游
    if (ctx.method === 'OPTIONS' && ctx.get('Access-Control-Request-Method')) {
      ctx.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      ctx.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      ctx.set('Access-Control-Max-Age', '600');
      ctx.status = 204;
      return;
    }

    // 头在进入下游之前写好，出错的响应也带着
    await next();
  };
}
