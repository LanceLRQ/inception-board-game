import { describe, expect, it } from 'vitest';
import { buildInviteUrl, publicOrigin } from './inviteLink';

describe('publicOrigin', () => {
  it('没有配置时取当前页面的来源', () => {
    expect(publicOrigin({}, 'http://localhost:3000')).toBe('http://localhost:3000');
    expect(publicOrigin({ VITE_PUBLIC_BASE_URL: '  ' }, 'http://localhost:3000')).toBe(
      'http://localhost:3000',
    );
  });

  it('环境变量优先，且只取来源（去掉路径与末尾斜杠）', () => {
    expect(
      publicOrigin(
        { VITE_PUBLIC_BASE_URL: 'https://ico.example.com/app/' },
        'http://localhost:3000',
      ),
    ).toBe('https://ico.example.com');
  });

  it('非法或非 http(s) 的配置被忽略', () => {
    expect(publicOrigin({ VITE_PUBLIC_BASE_URL: 'javascript:alert(1)' }, 'http://a.test')).toBe(
      'http://a.test',
    );
    expect(publicOrigin({ VITE_PUBLIC_BASE_URL: 'not a url' }, 'http://a.test')).toBe(
      'http://a.test',
    );
  });
});

describe('buildInviteUrl', () => {
  it('拼出 /invite/房间码，房间码规范成大写', () => {
    expect(buildInviteUrl('abc234', 'https://ico.example.com')).toBe(
      'https://ico.example.com/invite/ABC234',
    );
  });

  it('房间码里的特殊字符被转义', () => {
    expect(buildInviteUrl('a/b?c', 'https://x.test')).toBe('https://x.test/invite/A%2FB%3FC');
  });
});
