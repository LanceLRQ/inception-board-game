// 建局：校验建局参数（座位昵称、Bot 座位、随机种子）并生成初始状态。

import { createInitialState } from './setup.js';

const NICKNAME_MAX_LENGTH = 50;

/** 建局参数里的座位昵称：不给返回 null；给了就必须逐项合法 */
function parseNicknames(raw: unknown, numPlayers: number): string[] | null {
  if (raw === undefined) return null;
  if (
    !Array.isArray(raw) ||
    raw.length !== numPlayers ||
    raw.some((n) => typeof n !== 'string' || n.length < 1 || n.length > NICKNAME_MAX_LENGTH)
  ) {
    throw new Error(
      `setupData.nicknames 必须是长度为 ${numPlayers}、每项 1-${NICKNAME_MAX_LENGTH} 个字符的字符串数组`,
    );
  }
  return raw as string[];
}

/** 建局参数里的 Bot 座位：不给返回空数组；给了就必须是范围内不重复的座位号 */
function parseBotSeats(raw: unknown, numPlayers: number): string[] {
  if (raw === undefined) return [];
  const valid = new Set(Array.from({ length: numPlayers }, (_, i) => String(i)));
  if (
    !Array.isArray(raw) ||
    raw.some((s) => typeof s !== 'string' || !valid.has(s)) ||
    new Set(raw).size !== raw.length
  ) {
    throw new Error(`setupData.botSeats 必须是 '0'..'${numPlayers - 1}' 之内不重复的座位号数组`);
  }
  return raw as string[];
}

export function setupMatch(
  { ctx }: { ctx: { numPlayers: number } },
  setupData?: Record<string, unknown>,
) {
  const data = setupData ?? {};
  // 种子决定金库、贿赂、梦魇与牌库顺序，不能有默认值：漏传会让每局布局完全相同
  if (typeof data.rngSeed !== 'string' || data.rngSeed.length === 0) {
    throw new Error('建局必须提供非空的 rngSeed（setupData.rngSeed）');
  }
  const numPlayers = ctx.numPlayers;
  const playerIds = Array.from({ length: numPlayers }, (_, i) => String(i));
  const nicknames =
    parseNicknames(data.nicknames, numPlayers) ?? playerIds.map((_, i) => `Player ${i + 1}`);
  const botSeats = parseBotSeats(data.botSeats, numPlayers);

  return createInitialState({
    playerCount: numPlayers,
    playerIds,
    nicknames,
    botSeats,
    rngSeed: data.rngSeed,
    ruleVariant: data.ruleVariant as string | undefined,
    exCardsEnabled: data.exCardsEnabled as boolean | undefined,
    expansionEnabled: data.expansionEnabled as boolean | undefined,
  });
}
