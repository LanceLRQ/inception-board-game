// 房间分享链接：域名取自环境变量 VITE_PUBLIC_BASE_URL，没配置时取当前站点

interface InviteEnv {
  VITE_PUBLIC_BASE_URL?: string;
}

/** 邀请链接的路径前缀：服务端在这里按访问者返回分享卡片或跳转；没有服务端时由客户端路由接住 */
export const INVITE_PATH = '/invite';

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** 站点对外地址：环境变量优先（部署在反向代理或自定义域名之后时用），否则是当前页面的来源 */
export function publicOrigin(
  env: InviteEnv = import.meta.env as InviteEnv,
  pageOrigin: string = typeof window !== 'undefined' ? window.location.origin : '',
): string {
  const configured = env.VITE_PUBLIC_BASE_URL?.trim();
  return (configured ? originOf(configured) : null) ?? pageOrigin;
}

/** 分享给别人的邀请链接 */
export function buildInviteUrl(code: string, origin: string = publicOrigin()): string {
  return `${origin}${INVITE_PATH}/${encodeURIComponent(code.toUpperCase())}`;
}
