// 数据库里的对局、账号 ID 是 UUID 列：收到格式不对的字符串一定不存在，
// 直接判不存在即可，不要拿去查库（查库会得到数据库报错而不是空结果）。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
