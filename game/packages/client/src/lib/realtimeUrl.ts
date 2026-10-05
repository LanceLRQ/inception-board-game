// 实时连接地址：返回协议 + 主机 + 端口（不含路径，路径由连接类自己加）

interface RealtimeEnv {
  VITE_WS_URL?: string;
  VITE_API_URL?: string;
}

const DEFAULT_API_URL = 'http://localhost:3001';

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function pageOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function realtimeUrl(
  env: RealtimeEnv = import.meta.env as RealtimeEnv,
  fallbackOrigin: string = pageOrigin(),
): string {
  const ws = env.VITE_WS_URL;
  if (ws && !ws.startsWith('/')) {
    const origin = originOf(ws);
    if (origin) return origin;
  }
  const api = env.VITE_API_URL ?? DEFAULT_API_URL;
  return originOf(api) ?? fallbackOrigin;
}
