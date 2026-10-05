// 昵称规范化与校验：服务端写库前与客户端输入共用同一套规则

import { containsBannedWord } from './generator.js';

/** 昵称长度上限（按码点计） */
export const NICKNAME_MAX_LENGTH = 20;

// 肉眼不可见、却能用来伪造重名或拆开违禁词的字符，按 Unicode 类别整类去掉，不手列区间：
//   - 控制字符 Cc（制表符、换行等普通空白除外，它们留给后面折成单个空格，避免 "a\tb" 被粘成 "ab"）
//   - 格式字符 Cf：零宽字符、软连字符、双向控制符、字节序标记、标签字符等
//   - 变体选择符 U+FE00-FE0F、U+E0100-E01EF，以及组合用连接符 U+034F
//   - 看起来是空白的填充字符：U+115F、U+1160、U+3164、U+FFA0、U+2800、U+180E
//     （全角 / 半角填充符经 NFKC 会变成 U+1160，规范化顺序上这里两种形态都覆盖）
const INVISIBLE_CHARS =
  /(?![\t-\r])\p{Cc}|\p{Cf}|[\uFE00-\uFE0F\u{E0100}-\u{E01EF}\u034F\u115F\u1160\u3164\uFFA0\u2800\u180E]/gu;

/** 规范化：NFKC、去不可见字符、连续空白压成一个、去首尾空白 */
export function normalizeNickname(raw: string): string {
  // 保留制表符、换行等空白，留给后面折成单个空格，避免 "a\tb" 被粘成 "ab"
  return raw.normalize('NFKC').replace(INVISIBLE_CHARS, '').replace(/\s+/gu, ' ').trim();
}

export type NicknameValidation =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: 'empty' | 'too_long' | 'banned_word' };

/** 校验：规范化后 1–20 个码点且不含违禁词；通过时给出规范化后的值 */
export function validateNickname(raw: string): NicknameValidation {
  const value = normalizeNickname(raw);
  const length = Array.from(value).length;
  if (length < 1) return { ok: false, reason: 'empty' };
  if (length > NICKNAME_MAX_LENGTH) return { ok: false, reason: 'too_long' };
  if (containsBannedWord(value)) return { ok: false, reason: 'banned_word' };
  return { ok: true, value };
}
