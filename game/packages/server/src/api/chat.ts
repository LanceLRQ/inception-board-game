// 聊天预设 API
// 对照：plans/design/07-backend-network.md §7.9 聊天协议
//
// GET /chat/presets
//   - 可选 query: faction=thief|master|all → 过滤该阵营可见的预设
//   - 可选 query: category=greeting|tactic|emotion|feedback → 按分类过滤

import Router from '@koa/router';
import { CHAT_PRESETS, isPresetAvailableForFaction, type ChatPresetCategory } from '@icgame/shared';

const router = new Router();

router.get('/chat/presets', async (ctx) => {
  const factionQ = String(ctx.query.faction ?? 'all');
  const categoryQ = ctx.query.category ? String(ctx.query.category) : null;

  const filtered = CHAT_PRESETS.filter((p) => {
    if (!isPresetAvailableForFaction(p, factionQ)) return false;
    if (categoryQ && p.category !== (categoryQ as ChatPresetCategory)) return false;
    return true;
  }).sort((a, b) => a.displayOrder - b.displayOrder);

  ctx.body = {
    presets: filtered.map((p) => ({
      id: p.id,
      category: p.category,
      i18nKey: p.i18nKey,
      textZh: p.textZh,
      textEn: p.textEn,
      availableFactions: p.availableFactions,
      displayOrder: p.displayOrder,
    })),
  };
});

export { router as chatRouter };
