// move 参数的形状判断
// move 的参数来自客户端，类型标注不构成保证；形状不对一律按非法 move 处理。

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRecordOf<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is Record<string, T> {
  return isPlainRecord(value) && Object.values(value).every(isItem);
}
