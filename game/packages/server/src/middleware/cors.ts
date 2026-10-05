// 跨域中间件：按白名单给 HTTP 响应补跨域头，不依赖第三方库
//
// 令牌走 Authorization 头而不是 cookie，所以不发 Access-Control-Allow-Credentials。

import type { Middleware } from 'koa';

/** 把配置（单个源、逗号分隔的字符串或数组）整理成源列表 */
export function parseOrigins(origin: string | string[]): string[] {
  const list = Array.isArray(origin) ? origin : origin.split(',');
  return list.map((o) => o.trim()).filter((o) => o.length > 0);
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
