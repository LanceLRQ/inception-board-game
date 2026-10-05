import { describe, expect, it } from 'vitest';
import { realtimeUrl } from './realtimeUrl';

describe('realtimeUrl', () => {
  it('VITE_WS_URL 是绝对地址时取它的源', () => {
    expect(realtimeUrl({ VITE_WS_URL: 'wss://play.example.com:8443/ws' })).toBe(
      'wss://play.example.com:8443',
    );
    expect(realtimeUrl({ VITE_WS_URL: 'http://ws.local:4000', VITE_API_URL: 'http://api:1' })).toBe(
      'http://ws.local:4000',
    );
  });

  it('VITE_WS_URL 是路径或未设置时取 VITE_API_URL 的源', () => {
    expect(realtimeUrl({ VITE_WS_URL: '/ws', VITE_API_URL: 'https://api.example.com/v1' })).toBe(
      'https://api.example.com',
    );
    expect(realtimeUrl({ VITE_API_URL: 'http://10.0.0.5:3001' })).toBe('http://10.0.0.5:3001');
  });

  it('两者都未设置时用默认的本地服务端地址', () => {
    expect(realtimeUrl({})).toBe('http://localhost:3001');
  });

  it('VITE_API_URL 为空或相对路径时退回页面的源', () => {
    expect(realtimeUrl({ VITE_API_URL: '' }, 'https://page.example.com')).toBe(
      'https://page.example.com',
    );
    expect(
      realtimeUrl({ VITE_WS_URL: '/ws', VITE_API_URL: '/api' }, 'https://page.example.com'),
    ).toBe('https://page.example.com');
  });
});
