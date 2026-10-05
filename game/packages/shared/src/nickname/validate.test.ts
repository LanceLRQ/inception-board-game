import { describe, it, expect } from 'vitest';
import { NICKNAME_MAX_LENGTH, normalizeNickname, validateNickname } from './validate.js';

describe('normalizeNickname', () => {
  it('全角字符转半角', () => {
    expect(normalizeNickname('ＡＢＣ１２３')).toBe('ABC123');
  });
  it('去掉零宽字符与控制字符', () => {
    expect(normalizeNickname('a\u200Bb\u200C\u200D\uFEFFc\u0007d')).toBe('abcd');
  });
  it('首尾空白去掉，连续空白压成一个', () => {
    expect(normalizeNickname('  a \t\n  b  ')).toBe('a b');
  });
});

describe('validateNickname', () => {
  it('合法昵称返回规范化后的值', () => {
    expect(validateNickname('  旅行者  ')).toEqual({ ok: true, value: '旅行者' });
  });
  it('全空白拒绝', () => {
    expect(validateNickname('   ')).toMatchObject({ ok: false });
  });
  it('只含零宽字符拒绝', () => {
    expect(validateNickname('\u200B\u200B')).toMatchObject({ ok: false });
  });
  it('超长拒绝，恰好 20 个码点通过，按码点而非 UTF-16 单元计', () => {
    expect(validateNickname('a'.repeat(NICKNAME_MAX_LENGTH + 1))).toMatchObject({ ok: false });
    expect(validateNickname('a'.repeat(NICKNAME_MAX_LENGTH))).toMatchObject({ ok: true });
    expect(validateNickname('😀'.repeat(NICKNAME_MAX_LENGTH))).toMatchObject({ ok: true });
  });
  it('违禁词拒绝，且零宽字符拆开违禁词也会被识破', () => {
    expect(validateNickname('fuck')).toMatchObject({ ok: false });
    expect(validateNickname('fu\u200Bck')).toMatchObject({ ok: false });
  });
  it.each([
    ['软连字符', '官\u00AD方'],
    ['双向隔离符', '官\u2066方'],
    ['双向隔离符结束', '官\u2069方'],
    ['变体选择符', '官\uFE0F方'],
    ['补充变体选择符', '官\u{E0100}方'],
    ['标签字符', '官\u{E0020}方'],
    ['组合用连接符', 'fu\u034Fck'],
    ['阿拉伯字母标记', '官\u061C方'],
    ['废弃的对称交换符', '官\u206A方'],
  ])('%s夹在违禁词中间也会被识破', (_name, input) => {
    expect(validateNickname(input)).toMatchObject({ ok: false, reason: 'banned_word' });
  });
  it.each([
    ['全角填充符 U+3164', '\u3164'],
    ['半角填充符 U+FFA0', '\uFFA0'],
    ['谚文初声填充 U+115F', '\u115F'],
    ['谚文中声填充 U+1160', '\u1160'],
    ['盲文空白 U+2800', '\u2800'],
    ['蒙古文元音分隔符 U+180E', '\u180E'],
    ['阿拉伯字母标记 U+061C', '\u061C'],
    ['废弃的对称交换符 U+206A', '\u206A'],
    ['软连字符', '\u00AD'],
    ['变体选择符', '\uFE0F'],
  ])('只含%s的昵称按空昵称拒绝', (_name, input) => {
    expect(validateNickname(input)).toMatchObject({ ok: false, reason: 'empty' });
  });
});

describe('normalizeNickname 不可见字符', () => {
  it('去掉全部控制字符，但制表符与换行仍折成空格', () => {
    expect(normalizeNickname('a\u0085b\u001Fc\u007Fd\u009Fe')).toBe('abcde');
    expect(normalizeNickname('a\tb\nc')).toBe('a b c');
  });
});
