// 存档保存时间的显示：当天只显示时分，其他日子带上月日

export function formatSavedAt(savedAt: number, now: number, locale: string): string {
  const saved = new Date(savedAt);
  const today = new Date(now);
  const sameDay =
    saved.getFullYear() === today.getFullYear() &&
    saved.getMonth() === today.getMonth() &&
    saved.getDate() === today.getDate();
  try {
    return new Intl.DateTimeFormat(
      locale,
      sameDay
        ? { hour: '2-digit', minute: '2-digit' }
        : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    ).format(saved);
  } catch {
    // 不认识的语言标签
    return saved.toLocaleString();
  }
}
