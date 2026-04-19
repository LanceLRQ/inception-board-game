// 客户端结构化日志
// 对照：CLAUDE.md 日志规范
//
// 等级（参考 pino/syslog，数值越小越重要）：
//   ERROR(10) > WARN(20) > INFO(30) > DEBUG(40) > TRACE(50)
//
// 约定：
//   - `logger.flow(channel, msg, ctx?)` - 游戏流程关键点位（INFO 级别），dev 模式默认输出
//   - `logger.ai(channel, msg, ctx?)`   - AI 决策/行为（DEBUG 级别），dev 模式默认输出
//   - `logger.info/warn/error(...)`     - 通用级别
//   - `logger.debug/trace(...)`         - 详细调试；prod 下过滤
//
// Channel 命名建议：`game/turn`、`game/move`、`ai/move`、`lobby`、`room`、`net/room` 等
//
// 控制：
//   - dev 模式（import.meta.env.DEV=true）→ 默认 level=DEBUG
//   - prod 模式 → 默认 level=WARN
//   - localStorage.setItem('icgame-log-level', 'trace'|'debug'|'info'|'warn'|'error') 覆盖

const LEVELS = { error: 10, warn: 20, info: 30, debug: 40, trace: 50 } as const;
type LogLevel = keyof typeof LEVELS;

function readLevelOverride(): LogLevel | null {
  try {
    const v = globalThis.localStorage?.getItem?.('icgame-log-level');
    if (v && v in LEVELS) return v as LogLevel;
  } catch {
    /* ignore */
  }
  return null;
}

function isDev(): boolean {
  try {
    return !!import.meta.env?.DEV;
  } catch {
    return false;
  }
}

function currentLevel(): number {
  const override = readLevelOverride();
  if (override) return LEVELS[override];
  return isDev() ? LEVELS.debug : LEVELS.warn;
}

function format(ch: string, msg: string): string {
  return `[${ch}] ${msg}`;
}

function emit(
  level: LogLevel,
  consoleFn: (...args: unknown[]) => void,
  channel: string,
  msg: string,
  ctx?: unknown,
): void {
  if (LEVELS[level] > currentLevel()) return;
  if (ctx !== undefined) consoleFn(format(channel, msg), ctx);
  else consoleFn(format(channel, msg));
}

export const logger = {
  error: (channel: string, msg: string, ctx?: unknown) =>
    emit('error', console.error, channel, msg, ctx),
  warn: (channel: string, msg: string, ctx?: unknown) =>
    emit('warn', console.warn, channel, msg, ctx),
  info: (channel: string, msg: string, ctx?: unknown) =>
    emit('info', console.info, channel, msg, ctx),
  debug: (channel: string, msg: string, ctx?: unknown) =>
    emit('debug', console.debug, channel, msg, ctx),
  trace: (channel: string, msg: string, ctx?: unknown) =>
    emit('trace', console.debug, channel, msg, ctx),
  /** 游戏流程关键点位（INFO） */
  flow: (channel: string, msg: string, ctx?: unknown) =>
    emit('info', console.info, channel, msg, ctx),
  /** AI 决策/行为（DEBUG） */
  ai: (channel: string, msg: string, ctx?: unknown) =>
    emit('debug', console.debug, channel, msg, ctx),
};
