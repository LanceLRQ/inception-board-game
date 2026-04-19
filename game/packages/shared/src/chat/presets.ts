// 预设短语清单（MVP 固定 20 条，分 4 类）
// 对照：plans/design/07-backend-network.md §7.9 聊天协议 / plans/design/06-frontend-design.md 预设短语面板
//
// 设计：
//   - 仅广播 presetId，客户端按 i18n 渲染（避免 UGC 风险）
//   - availableFactions: all / thief / master（控制可发送阵营）
//   - category 用于面板 Tab 分组

export type ChatPresetCategory = 'greeting' | 'tactic' | 'emotion' | 'feedback';
export type ChatPresetFaction = 'all' | 'thief' | 'master';

export interface ChatPresetPhrase {
  readonly id: string;
  readonly category: ChatPresetCategory;
  readonly i18nKey: string;
  readonly textZh: string;
  readonly textEn: string;
  readonly availableFactions: ChatPresetFaction;
  readonly displayOrder: number;
}

/** MVP 固定 20 条预设短语。Phase 4+ 可迁移到 DB 表运营维护。 */
export const CHAT_PRESETS: readonly ChatPresetPhrase[] = [
  // --- 问候 ---
  {
    id: 'greet_hi',
    category: 'greeting',
    i18nKey: 'chat.greet.hi',
    textZh: '大家好！',
    textEn: 'Hello, everyone!',
    availableFactions: 'all',
    displayOrder: 1,
  },
  {
    id: 'greet_ready',
    category: 'greeting',
    i18nKey: 'chat.greet.ready',
    textZh: '我准备好了',
    textEn: "I'm ready",
    availableFactions: 'all',
    displayOrder: 2,
  },
  {
    id: 'greet_welcome',
    category: 'greeting',
    i18nKey: 'chat.greet.welcome',
    textZh: '欢迎来到梦境',
    textEn: 'Welcome to the dream',
    availableFactions: 'all',
    displayOrder: 3,
  },
  {
    id: 'greet_gl',
    category: 'greeting',
    i18nKey: 'chat.greet.gl',
    textZh: '祝玩得开心！',
    textEn: 'GL HF!',
    availableFactions: 'all',
    displayOrder: 4,
  },

  // --- 战术 ---
  {
    id: 'tactic_push',
    category: 'tactic',
    i18nKey: 'chat.tactic.push',
    textZh: '我们推进！',
    textEn: "Let's push!",
    availableFactions: 'thief',
    displayOrder: 10,
  },
  {
    id: 'tactic_retreat',
    category: 'tactic',
    i18nKey: 'chat.tactic.retreat',
    textZh: '先撤退',
    textEn: 'Retreat first',
    availableFactions: 'thief',
    displayOrder: 11,
  },
  {
    id: 'tactic_focus',
    category: 'tactic',
    i18nKey: 'chat.tactic.focus',
    textZh: '集火这一层',
    textEn: 'Focus on this layer',
    availableFactions: 'all',
    displayOrder: 12,
  },
  {
    id: 'tactic_wait',
    category: 'tactic',
    i18nKey: 'chat.tactic.wait',
    textZh: '等我一回合',
    textEn: 'Wait one turn',
    availableFactions: 'all',
    displayOrder: 13,
  },
  {
    id: 'tactic_trap',
    category: 'tactic',
    i18nKey: 'chat.tactic.trap',
    textZh: '小心陷阱',
    textEn: 'Watch for traps',
    availableFactions: 'thief',
    displayOrder: 14,
  },
  {
    id: 'tactic_signal',
    category: 'tactic',
    i18nKey: 'chat.tactic.signal',
    textZh: '注意梦主',
    textEn: 'Beware the Dream Master',
    availableFactions: 'thief',
    displayOrder: 15,
  },

  // --- 情感 ---
  {
    id: 'emotion_wow',
    category: 'emotion',
    i18nKey: 'chat.emotion.wow',
    textZh: '哇！',
    textEn: 'Wow!',
    availableFactions: 'all',
    displayOrder: 20,
  },
  {
    id: 'emotion_oops',
    category: 'emotion',
    i18nKey: 'chat.emotion.oops',
    textZh: '我失误了',
    textEn: 'My bad',
    availableFactions: 'all',
    displayOrder: 21,
  },
  {
    id: 'emotion_lucky',
    category: 'emotion',
    i18nKey: 'chat.emotion.lucky',
    textZh: '运气真好',
    textEn: 'Lucky!',
    availableFactions: 'all',
    displayOrder: 22,
  },
  {
    id: 'emotion_gg',
    category: 'emotion',
    i18nKey: 'chat.emotion.gg',
    textZh: 'GG 打得漂亮',
    textEn: 'GG, well played',
    availableFactions: 'all',
    displayOrder: 23,
  },
  {
    id: 'emotion_sigh',
    category: 'emotion',
    i18nKey: 'chat.emotion.sigh',
    textZh: '哎呀...',
    textEn: 'Sigh...',
    availableFactions: 'all',
    displayOrder: 24,
  },
  {
    id: 'emotion_laugh',
    category: 'emotion',
    i18nKey: 'chat.emotion.laugh',
    textZh: '哈哈哈',
    textEn: 'Hahaha',
    availableFactions: 'all',
    displayOrder: 25,
  },

  // --- 反馈 ---
  {
    id: 'feedback_thanks',
    category: 'feedback',
    i18nKey: 'chat.feedback.thanks',
    textZh: '谢谢！',
    textEn: 'Thanks!',
    availableFactions: 'all',
    displayOrder: 30,
  },
  {
    id: 'feedback_sorry',
    category: 'feedback',
    i18nKey: 'chat.feedback.sorry',
    textZh: '抱歉',
    textEn: 'Sorry',
    availableFactions: 'all',
    displayOrder: 31,
  },
  {
    id: 'feedback_nicemove',
    category: 'feedback',
    i18nKey: 'chat.feedback.nicemove',
    textZh: '这步真妙',
    textEn: 'Nice move',
    availableFactions: 'all',
    displayOrder: 32,
  },
  {
    id: 'feedback_bye',
    category: 'feedback',
    i18nKey: 'chat.feedback.bye',
    textZh: '辛苦大家！',
    textEn: 'Well done, everyone!',
    availableFactions: 'all',
    displayOrder: 33,
  },
];

const PRESET_INDEX = new Map(CHAT_PRESETS.map((p) => [p.id, p]));

export function findChatPreset(id: string): ChatPresetPhrase | null {
  return PRESET_INDEX.get(id) ?? null;
}

export function isValidChatPresetId(id: string): boolean {
  return PRESET_INDEX.has(id);
}

export function isPresetAvailableForFaction(
  preset: ChatPresetPhrase,
  faction: ChatPresetFaction | string,
): boolean {
  if (preset.availableFactions === 'all') return true;
  return preset.availableFactions === faction;
}

export function getChatPresetsByCategory(category: ChatPresetCategory): ChatPresetPhrase[] {
  return CHAT_PRESETS.filter((p) => p.category === category).sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
}
