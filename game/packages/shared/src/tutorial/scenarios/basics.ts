// 基础规则介绍：阵营 → 梦境 → 回合 → 行动 → 胜负
// 对照：docs/manual/01-game-overview.md + docs/manual/03-game-flow.md

import type { TutorialScenario } from '../types.js';
import { MATCH_MIN_PLAYERS, MATCH_MAX_PLAYERS } from '../../rules/playerCount.js';

export const BASICS_TUTORIAL: TutorialScenario = {
  id: 'basics',
  version: '1.1.0',
  title: '新手入门',
  description: '了解盗梦者与梦主的阵营、回合流程和基本胜负条件',
  estimatedMinutes: 7,
  steps: [
    {
      id: 'welcome',
      kind: 'info',
      title: '欢迎来到盗梦都市',
      body: `当前版本支持 ${MATCH_MIN_PLAYERS}–${MATCH_MAX_PLAYERS} 人对局。你将扮演潜入梦境的盗梦者，或守护秘密的梦主。这份介绍带你认识基本规则，读完后可选择单机练习或进入大厅。`,
      cta: 'next',
    },
    {
      id: 'factions',
      kind: 'info',
      title: '两大阵营',
      body: '开局有 1 位梦主，其余玩家为盗梦者。盗梦者寻找秘密，梦主阻止秘密被发现。\n盗梦者可能受到贿赂；抽到 DEAL 后成为背叛者，转为与梦主共同胜负。贿赂结果不会向其他玩家公开。',
      cta: 'next',
    },
    {
      id: 'layers',
      kind: 'info',
      title: '四层梦境',
      body: '第 1–4 层梦境各有心锁守护金库。某层心锁减到 0，该层金库打开；秘密藏在其中一个金库中。\n第 1 层与第 4 层不相邻。死亡后进入迷失层（第 0 层），不等于退出游戏。',
      cta: 'next',
    },
    {
      id: 'turn_flow',
      kind: 'info',
      title: '回合结构',
      body: '梦主先开始，之后按本局的座次方向轮流行动。以下是基本回合流程，具体技能或卡牌可以改变它。',
      cta: 'next',
    },
    {
      id: 'actions',
      kind: 'info',
      title: '行动牌',
      body: '【SHOOT】由目标掷骰，结果可能导致移动或死亡；【解封】用于减少同层心锁；【梦境穿梭剂】移动到相邻梦境；【凭空造物】抽 2 张牌。\n每回合只能成功解锁一次。其他玩家可用【解封】取消一次解封效果；进入迷失层后，可在自己的出牌阶段弃 2 张手牌复活。',
      cta: 'next',
    },
    {
      id: 'golden_rule',
      kind: 'info',
      title: '黄金定律',
      body: '规则冲突时，优先级为：\n技能 ＞ 行动牌 ＞ 世界观 ＞ 梦魇牌 ＞ 基础规则与梦主优势。\n遇到特殊效果时，以对应技能、卡牌和世界观的具体说明为准。',
      cta: 'next',
    },
    {
      id: 'win',
      kind: 'info',
      title: '胜负条件',
      body: '基本胜负条件：\n盗梦者打开存有秘密的金库即获胜，无需打开所有金库。\n牌库耗尽而秘密金库仍未打开，梦主阵营获胜。\n所有盗梦者进入迷失层不会直接判负；特殊世界观可能增加胜负条件。',
      cta: 'next',
    },
    {
      id: 'ready',
      kind: 'info',
      title: '开始前，再记住这几件事',
      body: '留意所在梦境、剩余心锁和牌库。出牌前查看目标与效果；需要时可在游戏内说明书查阅完整规则。\n点击「完成」结束介绍，再选择单机练习或进入大厅。',
      cta: 'next',
    },
  ],
};
