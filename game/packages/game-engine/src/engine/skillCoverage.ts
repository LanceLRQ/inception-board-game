// 卡牌配置里的技能 / 世界观与引擎实现的对账清单
//
// 「引擎入口」指引擎里有一个以配置标识登记的东西：engine/skills.ts 里的 `*_SKILL_ID` 常量。
// 配置里有、却没有引擎入口的技能与世界观必须登记在下面两张表之一，并写明原因；
// skillCoverage.test.ts 把这两张表与配置逐条对账（多登记、少登记都会失败）。
//
// 注意：有入口不等于已经接进对局流程；这里只对账「有没有以标识登记的入口」。

/** 引擎里没有可用的实现：没有任何代码，或只有没人调用的纯函数 */
export const SKILLS_NOT_IMPLEMENTED: Readonly<Record<string, string>> = {
  'thief_apollo.skill_1': '日冕：引擎里没有任何实现，只有崇拜（skill_0）',
  'thief_green_ray.skill_1': '信念：引擎里没有任何实现，只有缉捕（skill_0）',
  'dm_chess.worldview':
    '棋局世界观：只有没人调用的纯函数 applyChessWorldViewPeek，梦境窥视不会多抽牌',
  'dm_fortress.worldview':
    '要塞世界观（梦主掷骰结果 -1）：只有没人调用的纯函数 applyFortressDiceModifier，结算骰值时不生效',
};

/** 效果已在引擎里生效，但以梦主 / 角色 id 内联判断，没有以配置标识登记的入口 */
export const SKILLS_IMPLEMENTED_WITHOUT_ID: Readonly<Record<string, string>> = {
  'thief_terrorist.skill_1':
    '狂热：SHOOT 结算前由 game.ts 按射手角色 id 挂起应答窗口，拒绝弃牌则骰值 -1',
  'dm_harbor.worldview':
    '港口世界观：终局判定 endIf 里的 checkHarborWin（两个金库打开且秘密未开，梦主胜）',
  'dm_mercury_route.worldview':
    '航路世界观：startGame 分配梦主角色后由 applyMercuryRouteExtraFailBribe 向贿赂池追加 1 张失败贿赂',
  'dm_black_hole.worldview': '黑洞世界观：getEffectiveMaxUnlockPerTurn 把每回合解锁上限提到 2',
  'dm_midsummer.skill_0': '充盈：抽牌阶段按未派发贿赂数多抽牌（getMidsummerExtraDraws）',
  'dm_midsummer.worldview': '盛夏世界观：抽牌阶段盗梦者多抽 1 张（getMidsummerWorldThiefBonus）',
  'dm_uranus_firmament.worldview':
    '苍穹世界观：盗梦者因行动牌改变层数时弃牌（applyUranusFirmamentMoveDiscard）',
  'dm_jupiter_peak.skill_0': '雷霆：SHOOT 骰值小于梦主所在层则直接击杀（shouldJupiterThunderKill）',
  'dm_jupiter_peak.worldview': '巅峰世界观：SHOOT 可对相邻层使用（isJupiterPeakWorldActive）',
  'dm_pluto_hell.worldview':
    '地狱世界观：抽牌数改为掷骰、手牌过多进迷失层（applyPlutoHellLostCheck）',
  'dm_secret_passage.worldview': '密道世界观：复活只能弃 1 张梦境穿梭剂（applyRevive）',
  'dm_neptune_ocean.worldview': '泓洋世界观：金币金库被打开则梦主胜（checkNeptuneWin）',
};
