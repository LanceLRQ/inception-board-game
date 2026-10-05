// 本地人机对局 Bot 的 move 名单与优先级表
// 与 simpleBot.ts 内的优先级表相互独立：这里服务于「按回合子阶段给出合法 move 名单后挑一个」的流程。

/**
 * 按 G.turnPhase 划分的合法 move 白名单
 * 对照：game-engine/src/game.ts guardTurnPhase
 */
export const MOVES_BY_PHASE: Record<string, string[]> = {
  draw: ['doDraw', 'skipDraw', 'playJokerGamble', 'playBlackSwanTour', 'playBlackHoleLevy'],
  action: [
    'endActionPhase',
    'playShoot',
    'dreamMasterMove',
    'playUnlock',
    // 响应类 / 梦境窥视三段式中间态 move 不放进 action 白名单
    //   原因：本名单是 pickBotMove 的合法 move 来源；若包含响应类，
    //         Bot 会主动选中 → 引擎判定非法 move，污染日志。
    //   正确路径：响应窗口 / pendingPeekDecision / peekReveal 由调度层专用代发，
    //         不经过 pickBotMove。
    //   被排除的 move（仅供调度层显式发起，不参与 pickBotMove）：
    //     - respondCancelUnlock / passResponse / resolveUnlock
    //     - masterPeekBribeDecision / peekerAcknowledge
    'playDreamTransit',
    'playCreation',
    'playKick',
    'playTelekinesis',
    'useChessTranspose',
    'masterDealBribe',
    'playPeek',
    'playPeekMaster',
    'playGraft',
    'resolveGraft',
    'playTimeStorm',
    'playResonance',
    'playGravity',
    'resolveGravityPick',
    'playShootKing',
    'playShootArmor',
    'playShootBurst',
    'playShootDreamTransit',
    'playGreenRayArrest',
    'playShootSudger',
    'resolveSudgerPick',
    'resolveShootMove',
    'useSagittariusHeartLock',
    'playShift',
    'masterRevealNightmare',
    'masterDiscardNightmare',
    'masterActivateNightmare',
    'playNightmareUnlock',
    'masterDealBribeImperial',
    'playSecretPassageTeleport',
    'useUranusPower',
    'usePlutoBurning',
    'useMarsKill',
    'useSaturnFreeMove',
    'useMarsBattlefield',
    'useVenusDouble',
    'masterDiscardHiddenNightmare',
    'playLibraBalance',
    'resolveLibraSplit',
    'resolveLibraPick',
    'playForgerExchangeSingle',
    'useSpaceQueenStashTop',
    'useBlackHoleAbsorb',
    'useImperialCityWorldShoot',
    'playRevive',
    'useVenusMirrorWorld',
  ],
  discard: ['doDiscard', 'skipDiscard', 'useSpaceQueenStashTop'],
};

// move 优先级：数字小 = 更优先
// Bot L0 策略：尽量推进流程，不主动使用复杂 move（避免参数构造错误）
// 行动阶段首选 endActionPhase（流程向前推进）
export const MOVE_PRIORITY: Record<string, number> = {
  doDraw: 1,
  skipDraw: 2,
  endActionPhase: 1, // action 阶段最高优先：结束回合
  playShoot: 90,
  playUnlock: 91,
  playDreamTransit: 92,
  playCreation: 93,
  dreamMasterMove: 94,
  playKick: 95,
  playTelekinesis: 96,
  useChessTranspose: 97,
  masterDealBribe: 98,
  playPeek: 99,
  playPeekMaster: 230, // 梦主效果② 默认低优先（Bot L0 不主动使用）
  playGraft: 100,
  playTimeStorm: 101,
  playResonance: 102,
  playGravity: 103,
  resolveGravityPick: 0, // 必须优先结算进行中的挑选
  playShootKing: 104,
  playShootArmor: 105,
  playShootBurst: 106,
  playShootDreamTransit: 107,
  playGreenRayArrest: 109,
  playShootSudger: 111,
  resolveSudgerPick: 0, // 必须优先结算定罪选择
  resolveShootMove: 0, // 必须优先结算 pendingShootMove（发动方选层）
  useSagittariusHeartLock: 112,
  playShift: 108,
  masterRevealNightmare: 200, // 梦主低优先：Bot L0 默认不主动触发
  masterDiscardNightmare: 201,
  masterActivateNightmare: 202,
  playNightmareUnlock: 110,
  masterDealBribeImperial: 210,
  playSecretPassageTeleport: 211,
  useUranusPower: 212,
  usePlutoBurning: 213,
  useMarsKill: 214,
  useSaturnFreeMove: 115, // 盗梦者主动技能（中优先级）
  useMarsBattlefield: 116,
  masterDiscardHiddenNightmare: 215, // 梦主低优先：Bot L0 默认不主动触发
  useVenusDouble: 216, // 金星·重影（梦主低优先，避免 Bot 无手牌时误发）
  playJokerGamble: 220, // 小丑·赌博：draw 阶段替代 doDraw（Bot L0 不主动选）
  playBlackSwanTour: 221, // 黑天鹅·巡演：draw 阶段替代 doDraw（Bot L0 不主动选）

  resolveGraft: 0, // 必须优先结算 pendingGraft，才能推进流程
  resolveLibraSplit: 0, // pendingLibra step 2：优先处理
  resolveLibraPick: 0, // pendingLibra step 3：优先处理
  // 响应窗口 / 梦境窥视回合外推进（由调度层代发，
  //   不走 pickBotMove 路径；此处记录以保持白名单一致）
  respondCancelUnlock: 0,
  passResponse: 0,
  resolveUnlock: 0,
  masterPeekBribeDecision: 0,
  peekerAcknowledge: 0,
  playLibraBalance: 117, // 天秤入口（盗梦者主动技能，中优先级）
  playForgerExchangeSingle: 118, // 欺诈师入口（同上）
  useSpaceQueenStashTop: 220, // 空间女王·造物（Bot L0 不主动选）
  playBlackHoleLevy: 222, // 黑洞·吞噬（draw 阶段替代，Bot L0 不主动选）
  useBlackHoleAbsorb: 119, // 黑洞·吸纳（盗梦者主动技能，中优先级）
  useImperialCityWorldShoot: 120, // 皇城世界观（中优先级）
  playRevive: 50, // 复活（高优先级，推进游戏流程）
  useVenusMirrorWorld: 130, // 金星·镜界世界观（中低优先级）
  skipDiscard: 1,
  doDiscard: 2,
};

/** 根据当前 phase/turnPhase 计算合法 move 名单 */
export function legalMovesFor(phase: string | null, turnPhase: string): string[] {
  if (phase === 'setup') return ['completeSetup'];
  if (!turnPhase) return [];
  return MOVES_BY_PHASE[turnPhase] ?? [];
}
