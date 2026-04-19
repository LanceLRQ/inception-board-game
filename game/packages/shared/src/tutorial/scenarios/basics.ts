// 基础教学剧本：5-8 分钟，覆盖首屏 → 匹配 → 对局核心概念 → 胜负条件
// 对照：docs/manual/01-game-overview.md + docs/manual/03-game-flow.md

import type { TutorialScenario } from '../types.js';

export const BASICS_TUTORIAL: TutorialScenario = {
  id: 'basics',
  version: '1.0.0',
  title: '新手入门',
  description: '7 分钟带你走完一局完整流程，了解盗梦者与梦主的对抗机制',
  estimatedMinutes: 7,
  steps: [
    {
      id: 'welcome',
      kind: 'info',
      title: '欢迎来到盗梦都市',
      body: '这是一款 3-10 人的隐藏身份对抗桌游。你将和朋友一起，扮演潜入梦境的盗梦者，或是守护梦境的梦主。点击「继续」开始旅程。',
      cta: 'next',
    },
    {
      id: 'factions',
      kind: 'info',
      title: '两大阵营',
      body: '每局游戏中，1 位玩家随机成为「梦主」，其余玩家都是「盗梦者」。盗梦者需要解开梦境深处的秘密，梦主则要阻止他们。注意：盗梦者之间也不知道彼此身份哦～',
      cta: 'next',
    },
    {
      id: 'layers',
      kind: 'info',
      title: '四层梦境',
      body: '游戏由 4 层梦境构成。每层都有「心锁」（蓝色骰子显示）守护——只有解开所有心锁，才能打开金库窥见秘密。',
      cta: 'next',
    },
    {
      id: 'turn_flow',
      kind: 'info',
      title: '回合结构',
      body: '每回合分 5 个阶段：回合开始 → 抽牌 → 出牌 → 弃牌 → 回合结束。按逆时针顺序轮流进行，梦主可在特定阶段触发技能。',
      cta: 'next',
    },
    {
      id: 'actions',
      kind: 'info',
      title: '行动牌',
      body: '行动牌分多类：SHOOT（攻击）、解封（减心锁）、穿梭（切换层）、凭空造物（补牌）等。合理搭配组合是制胜关键。',
      cta: 'next',
    },
    {
      id: 'golden_rule',
      kind: 'info',
      title: '黄金定律',
      body: '规则冲突时遵循优先级：技能 > 行动牌 > 世界观 > 梦魇 > 基础规则。记住它，就能预判对手的反应窗口。',
      cta: 'next',
    },
    {
      id: 'win',
      kind: 'info',
      title: '胜负条件',
      body: '盗梦者：打开所有秘密金库即胜。梦主：所有盗梦者死亡或无法继续破译即胜。谨慎选择每一张出牌！',
      cta: 'next',
    },
    {
      id: 'ready',
      kind: 'choice',
      title: '准备好了吗？',
      body: '你已掌握基础规则。接下来可以选择立即开始一局人机对战，或先浏览角色图鉴了解更多。',
      choices: [
        { id: 'start_bot', label: '开始人机对战' },
        { id: 'browse_cards', label: '浏览角色图鉴' },
      ],
    },
  ],
};
