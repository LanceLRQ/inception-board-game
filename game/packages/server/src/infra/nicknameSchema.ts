// 昵称的 zod 校验：规则在 shared 里，这里只负责把结果接到请求体解析上

import { z } from 'zod';
import { validateNickname } from '@icgame/shared';

const REASON_MESSAGE = {
  empty: 'nickname must not be empty',
  too_long: 'nickname is too long',
  banned_word: 'nickname contains a banned word',
} as const;

/** 解析后得到规范化的昵称（1–20 个字符，不含违禁词） */
export const nicknameSchema = z.string().transform((raw, ctx) => {
  const result = validateNickname(raw);
  if (!result.ok) {
    ctx.addIssue({ code: 'custom', message: REASON_MESSAGE[result.reason] });
    return z.NEVER;
  }
  return result.value;
});
