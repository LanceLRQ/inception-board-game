// 恢复码的格式常量与输入整理：服务端校验与客户端输入共用，长度只在这里定义一次
//
// 恢复码是 Crockford Base32（不含 I L O U），12 位，展示时每 4 位一组、用连字符连接：XXXX-XXXX-XXXX。

/** 恢复码字符数（不含连字符） */
export const RECOVERY_CODE_LENGTH = 12;

/** 展示时每组的字符数 */
export const RECOVERY_CODE_GROUP_SIZE = 4;

/** 带连字符的展示形式的字符数（输入框的长度上限） */
export const RECOVERY_CODE_FORMATTED_LENGTH =
  RECOVERY_CODE_LENGTH + Math.ceil(RECOVERY_CODE_LENGTH / RECOVERY_CODE_GROUP_SIZE) - 1;

/** 恢复码字符集：Crockford Base32，排除 I L O U 以免混淆 */
export const RECOVERY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * 把任意输入整理成规范字符串（无连字符）：转大写、丢掉非字母数字、
 * 按 Crockford 规则归一易混字符（O→0，I/L→1，U 丢弃），最多保留规定长度。
 * 用户抄写时把 0 看成 O、1 看成 I 很常见，归一后才不会被当成无效码。
 */
export function normalizeRecoveryCodeInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[OIL]/g, (c) => (c === 'O' ? '0' : '1'))
    .replace(/[^0-9A-Z]/g, '')
    .replace(/U/g, '')
    .slice(0, RECOVERY_CODE_LENGTH);
}

/** 把规范字符串（可不足长度）按组加连字符，不足一组时不带尾部连字符 */
export function formatRecoveryCode(chars: string): string {
  const groups: string[] = [];
  for (let i = 0; i < chars.length; i += RECOVERY_CODE_GROUP_SIZE) {
    groups.push(chars.slice(i, i + RECOVERY_CODE_GROUP_SIZE));
  }
  return groups.join('-');
}

const ALPHABET_PATTERN = new RegExp(`^[${RECOVERY_CODE_ALPHABET}]+$`);

/** 去掉连字符并转大写后，是不是正好 12 个规范字符（不做易混字符归一，服务端用） */
export function isRecoveryCodeShape(code: string): boolean {
  const compact = code.replace(/-/g, '').toUpperCase();
  return compact.length === RECOVERY_CODE_LENGTH && ALPHABET_PATTERN.test(compact);
}
