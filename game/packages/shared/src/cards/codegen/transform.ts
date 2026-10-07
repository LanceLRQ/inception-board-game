// 卡牌数据文件 → 卡牌配置的转换（纯函数）
//
// 生成脚本（scripts/codegen.ts）读出数据文件后交给这里转换，再把结果写成 generated/cards.ts。
// 数据对不上预期（缺字段、重复 id、行动牌不在分类表里等）一律抛错，不做默认值兜底。

import type {
  ActionCardDefinition,
  BribeCardDefinition,
  CardBackImages,
  CharacterDefinition,
  CharacterSideDefinition,
  DreamCardDefinition,
  NightmareCardDefinition,
  OtherCardDefinition,
  SkillDefinition,
  VaultCardDefinition,
  WorldViewDefinition,
} from '../../types/cards.js';
import type { ActionSubType } from '../../types/enums.js';
import { ACTION_SUB_TYPES } from '../actionSubTypes.js';

// === 数据文件的形状（只描述用到的部分）===

export interface RawSkill {
  name?: string;
  description?: string;
  /** 梦主的条目才有：skill 为技能，worldview 为世界观 */
  type?: string;
}

export interface RawSide {
  side?: string;
  name?: string;
  image?: string;
  skills?: RawSkill[];
  analyze?: string;
}

export interface RawCard {
  id?: string;
  name?: string;
  /** 数字；贿赂牌是按人数（4 到 10）给出的数组 */
  quantity?: number | number[];
  /** 'back' 表示通用背面的占位条目；盗梦者有 single / double-sided */
  type?: string;
  expansion?: boolean;
  image?: string;
  description?: string;
  analyze?: string;
  useTiming?: string;
  useTarget?: string;
  sides?: RawSide[];
  skills?: RawSkill[];
}

export interface RawCardsData {
  cards: {
    thief?: RawCard[];
    'dream-master'?: RawCard[];
    action?: RawCard[];
    dream?: RawCard[];
    bribe?: RawCard[];
    vault?: RawCard[];
    nightmare?: RawCard[];
    other?: RawCard[];
  };
}

// === 转换结果 ===

export interface CardTables {
  readonly thiefCharacters: CharacterDefinition[];
  readonly masterCharacters: CharacterDefinition[];
  readonly actionCards: ActionCardDefinition[];
  readonly nightmareCards: NightmareCardDefinition[];
  readonly dreamCards: DreamCardDefinition[];
  readonly vaultCards: VaultCardDefinition[];
  readonly bribeCards: BribeCardDefinition[];
  readonly otherCards: OtherCardDefinition[];
  readonly backImages: CardBackImages;
}

export interface TransformOptions {
  /** 行动牌分类表；缺省用入库的手工映射表 */
  readonly actionSubTypes?: Readonly<Record<string, ActionSubType>>;
}

/** 贿赂牌按人数给张数时覆盖的人数范围 */
export const BRIBE_PLAYER_COUNTS = [4, 5, 6, 7, 8, 9, 10] as const;

// 图片路径规范化：数据文件里是 .jpg，对外产物用预压缩过的 .webp，
// 并剥掉前导 "cards/"，改为相对卡图根目录（public/cards/）的路径
export function normalizeImagePath(src: string): string {
  const webp = src.replace(/\.(jpg|jpeg|png)$/i, '.webp');
  return webp.replace(/^cards\//, '');
}

// === 取值与校验 ===

function fail(where: string, what: string): never {
  throw new Error(`卡牌数据有误（${where}）：${what}`);
}

function str(value: unknown, where: string, field: string): string {
  if (typeof value !== 'string' || value === '') fail(where, `缺少文字字段 ${field}`);
  return value;
}

function optStr(value: unknown, where: string, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value === '') fail(where, `${field} 不是非空文字`);
  return value;
}

function positiveInt(value: unknown, where: string, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    fail(where, `${field} 不是正整数`);
  }
  return value;
}

function image(value: unknown, where: string): string {
  return normalizeImagePath(str(value, where, 'image'));
}

function analysisOf(raw: string | undefined, where: string): { analysis?: string } {
  const analysis = optStr(raw, where, 'analyze');
  return analysis === undefined ? {} : { analysis };
}

function listOf(cards: RawCard[] | undefined, category: string): RawCard[] {
  if (!Array.isArray(cards)) fail(category, '缺少这一类的牌表');
  return cards;
}

function splitBacks(cards: RawCard[]): { backs: RawCard[]; real: RawCard[] } {
  return {
    backs: cards.filter((c) => c.type === 'back'),
    real: cards.filter((c) => c.type !== 'back'),
  };
}

function singleBackImage(backs: RawCard[], category: string): string {
  if (backs.length !== 1) fail(category, `背面占位条目应当恰好 1 个，实际 ${backs.length} 个`);
  return image(backs[0]!.image, `${category} 背面`);
}

function assertUniqueIds(ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) fail(id, '卡牌 id 重复');
    seen.add(id);
  }
}

// === 角色 ===

function skillOf(raw: RawSkill, id: string, where: string): SkillDefinition {
  return {
    id,
    name: str(raw.name, where, 'skill.name'),
    description: str(raw.description, where, 'skill.description'),
  };
}

function thiefCharacter(card: RawCard): CharacterDefinition {
  const id = str(card.id, 'thief', 'id');
  if (card.quantity !== undefined && card.quantity !== 1) fail(id, '角色牌的张数应为 1');
  if (card.type !== 'single' && card.type !== 'double-sided') {
    fail(id, `盗梦者的 type 应为 single 或 double-sided，实际 ${String(card.type)}`);
  }
  const doubleSided = card.type === 'double-sided';
  const front = card.sides?.find((s) => s.side === 'front');
  const back = card.sides?.find((s) => s.side === 'back');
  if (!front || !back) fail(id, '缺少 front 或 back 面');
  if (!front.skills?.length) fail(id, '正面没有技能');
  if (doubleSided && !back.skills?.length) fail(id, '双面角色的背面没有技能');
  if (!doubleSided && back.skills?.length) fail(id, '单面角色的背面不应带技能');

  const frontSide: CharacterSideDefinition = {
    sideName: str(front.name, id, 'front.name'),
    skills: front.skills.map((s, i) => skillOf(s, `${id}.skill_${i}`, id)),
    ...analysisOf(front.analyze, id),
  };
  const backSide: CharacterSideDefinition | undefined = doubleSided
    ? {
        sideName: str(back.name, id, 'back.name'),
        skills: back.skills!.map((s, i) => skillOf(s, `${id}.back.skill_${i}`, id)),
        ...analysisOf(back.analyze, id),
      }
    : undefined;

  return {
    category: 'thief_char',
    id,
    name: str(card.name, id, 'name'),
    faction: 'thief',
    doubleSided,
    front: frontSide,
    ...(backSide ? { back: backSide } : {}),
    imagePath: image(front.image, id),
    // 单面角色的背面图是通用背面，由 CARD_BACK_IMAGES 给出
    ...(doubleSided ? { backImagePath: image(back.image, id) } : {}),
    isExpansion: card.expansion === true,
  };
}

function masterCharacter(card: RawCard): CharacterDefinition {
  const id = str(card.id, 'dream-master', 'id');
  if (card.quantity !== undefined && card.quantity !== 1) fail(id, '角色牌的张数应为 1');
  const items = card.skills ?? [];
  const skills = items.filter((s) => s.type === 'skill');
  const worldViews = items.filter((s) => s.type === 'worldview');
  if (skills.length === 0) fail(id, '梦主没有技能');
  if (worldViews.length !== 1) fail(id, `梦主的世界观应恰好 1 个，实际 ${worldViews.length} 个`);
  if (skills.length + worldViews.length !== items.length) {
    fail(id, '梦主的条目里有 type 既不是 skill 也不是 worldview 的项');
  }
  const wv = worldViews[0]!;
  const worldView: WorldViewDefinition = {
    id: `${id}.worldview`,
    name: str(wv.name, id, 'worldview.name'),
    description: str(wv.description, id, 'worldview.description'),
  };
  const name = str(card.name, id, 'name');
  return {
    category: 'master_char',
    id,
    name,
    faction: 'master',
    doubleSided: false,
    front: {
      sideName: name,
      skills: skills.map((s, i) => skillOf(s, `${id}.skill_${i}`, id)),
      worldView,
      ...analysisOf(card.analyze, id),
    },
    imagePath: image(card.image, id),
    isExpansion: card.expansion === true,
  };
}

// === 行动牌 ===

function actionCard(
  card: RawCard,
  subTypes: Readonly<Record<string, ActionSubType>>,
): ActionCardDefinition {
  const id = str(card.id, 'action', 'id');
  const subType = subTypes[id];
  if (!subType) fail(id, '行动牌不在分类表（cards/actionSubTypes.ts）里，请补一行');
  return {
    category: 'action',
    id,
    name: str(card.name, id, 'name'),
    subType,
    quantity: positiveInt(card.quantity, id, 'quantity'),
    isExpansion: card.expansion === true,
    description: str(card.description, id, 'description'),
    useTiming: str(card.useTiming, id, 'useTiming'),
    useTarget: str(card.useTarget, id, 'useTarget'),
    ...analysisOf(card.analyze, id),
    imagePath: image(card.image, id),
  };
}

// === 其余各类 ===

function nightmareCard(card: RawCard): NightmareCardDefinition {
  const id = str(card.id, 'nightmare', 'id');
  return {
    category: 'nightmare',
    id,
    name: str(card.name, id, 'name'),
    description: str(card.description, id, 'description'),
    quantity: positiveInt(card.quantity, id, 'quantity'),
    ...analysisOf(card.analyze, id),
    imagePath: image(card.image, id),
  };
}

function dreamCard(card: RawCard): DreamCardDefinition {
  const id = str(card.id, 'dream', 'id');
  return {
    category: 'dream',
    id,
    name: str(card.name, id, 'name'),
    description: str(card.description, id, 'description'),
    imagePath: image(card.image, id),
  };
}

function vaultCard(card: RawCard): VaultCardDefinition {
  const id = str(card.id, 'vault', 'id');
  return {
    category: 'vault',
    id,
    name: str(card.name, id, 'name'),
    description: str(card.description, id, 'description'),
    quantity: positiveInt(card.quantity, id, 'quantity'),
    imagePath: image(card.image, id),
  };
}

function bribeCard(card: RawCard): BribeCardDefinition {
  const id = str(card.id, 'bribe', 'id');
  const list = card.quantity;
  if (!Array.isArray(list) || list.length !== BRIBE_PLAYER_COUNTS.length) {
    fail(id, `贿赂牌的 quantity 应为 ${BRIBE_PLAYER_COUNTS.length} 项（对应 4 到 10 人）的数组`);
  }
  const quantityByPlayerCount: Record<number, number> = {};
  BRIBE_PLAYER_COUNTS.forEach((players, i) => {
    quantityByPlayerCount[players] = positiveInt(list[i], id, `quantity[${i}]`);
  });
  return {
    category: 'bribe',
    id,
    name: str(card.name, id, 'name'),
    description: str(card.description, id, 'description'),
    quantityByPlayerCount,
    imagePath: image(card.image, id),
  };
}

function otherCard(card: RawCard): OtherCardDefinition {
  const id = str(card.id, 'other', 'id');
  return {
    category: 'other',
    id,
    name: str(card.name, id, 'name'),
    description: str(card.description, id, 'description'),
    imagePath: image(card.image, id),
  };
}

// === 入口 ===

export function transformCards(raw: RawCardsData, options: TransformOptions = {}): CardTables {
  const subTypes = options.actionSubTypes ?? ACTION_SUB_TYPES;
  const cards = raw.cards;

  const thiefRaw = listOf(cards.thief, 'thief');
  const master = splitBacks(listOf(cards['dream-master'], 'dream-master'));
  const action = splitBacks(listOf(cards.action, 'action'));
  const nightmare = splitBacks(listOf(cards.nightmare, 'nightmare'));
  const vault = splitBacks(listOf(cards.vault, 'vault'));
  const bribe = splitBacks(listOf(cards.bribe, 'bribe'));

  const thiefCharacters = thiefRaw.map(thiefCharacter);
  const masterCharacters = master.real.map(masterCharacter);
  const actionCards = action.real.map((c) => actionCard(c, subTypes));
  const nightmareCards = nightmare.real.map(nightmareCard);
  const dreamCards = listOf(cards.dream, 'dream').map(dreamCard);
  const vaultCards = vault.real.map(vaultCard);
  const bribeCards = bribe.real.map(bribeCard);
  const otherCards = listOf(cards.other, 'other').map(otherCard);

  // 分类表与数据一一对应：表里不能有数据里不存在的行动牌
  const actionIds = new Set(actionCards.map((c) => c.id));
  for (const id of Object.keys(subTypes)) {
    if (!actionIds.has(id)) fail(id, '分类表里有这张行动牌，但数据里没有');
  }

  assertUniqueIds(
    [
      ...thiefCharacters,
      ...masterCharacters,
      ...actionCards,
      ...nightmareCards,
      ...dreamCards,
      ...vaultCards,
      ...bribeCards,
      ...otherCards,
    ].map((c) => c.id),
  );

  // 单面盗梦者共用同一张通用背面
  const thiefBacks = new Set(
    thiefRaw
      .filter((c) => c.type === 'single')
      .map((c) => image(c.sides?.find((s) => s.side === 'back')?.image, str(c.id, 'thief', 'id'))),
  );
  if (thiefBacks.size !== 1) fail('thief', '单面盗梦者的背面图应只有一种');

  return {
    thiefCharacters,
    masterCharacters,
    actionCards,
    nightmareCards,
    dreamCards,
    vaultCards,
    bribeCards,
    otherCards,
    backImages: {
      thief: [...thiefBacks][0]!,
      master: singleBackImage(master.backs, 'dream-master'),
      action: singleBackImage(action.backs, 'action'),
      bribe: singleBackImage(bribe.backs, 'bribe'),
      vault: singleBackImage(vault.backs, 'vault'),
      nightmare: singleBackImage(nightmare.backs, 'nightmare'),
    },
  };
}

// === 统计 ===

export interface CardCounts {
  /** 牌种定义的条数：八张牌表的条目总数，不含背面 */
  readonly definitions: number;
  /** 数据明确给出张数的实体牌张数：角色牌（每种 1 张）、行动牌、梦魇牌、金库牌；
   *  不含梦境牌与其他牌（数据没给张数）和贿赂牌（张数随人数变化） */
  readonly copies: number;
}

export function countCards(t: CardTables): CardCounts {
  const sum = (items: readonly { quantity: number }[]): number =>
    items.reduce((n, c) => n + c.quantity, 0);
  return {
    definitions:
      t.thiefCharacters.length +
      t.masterCharacters.length +
      t.actionCards.length +
      t.nightmareCards.length +
      t.dreamCards.length +
      t.vaultCards.length +
      t.bribeCards.length +
      t.otherCards.length,
    copies:
      t.thiefCharacters.length +
      t.masterCharacters.length +
      sum(t.actionCards) +
      sum(t.nightmareCards) +
      sum(t.vaultCards),
  };
}

// === 渲染为 TypeScript 源码（未排版）===

const HEADER = [
  '// ⚠️ AUTO-GENERATED by scripts/codegen.ts — DO NOT EDIT',
  '// Source: cards-data.json（内部素材目录，不入库）',
  '',
].join('\n');

function tableDecl(name: string, type: string, value: unknown): string {
  return `export const ${name}: readonly ${type}[] = ${JSON.stringify(value, null, 2)};`;
}

export function renderCardsModule(t: CardTables): string {
  const counts = countCards(t);
  return [
    HEADER,
    'import type {',
    '  CardBackImages,',
    '  CharacterDefinition,',
    '  ActionCardDefinition,',
    '  NightmareCardDefinition,',
    '  DreamCardDefinition,',
    '  VaultCardDefinition,',
    '  BribeCardDefinition,',
    '  OtherCardDefinition,',
    '} from "../../types/cards.js";',
    '',
    tableDecl('THIEF_CHARACTERS', 'CharacterDefinition', t.thiefCharacters),
    '',
    tableDecl('MASTER_CHARACTERS', 'CharacterDefinition', t.masterCharacters),
    '',
    tableDecl('ACTION_CARDS', 'ActionCardDefinition', t.actionCards),
    '',
    tableDecl('NIGHTMARE_CARDS', 'NightmareCardDefinition', t.nightmareCards),
    '',
    tableDecl('DREAM_CARDS', 'DreamCardDefinition', t.dreamCards),
    '',
    tableDecl('VAULT_CARDS', 'VaultCardDefinition', t.vaultCards),
    '',
    tableDecl('BRIBE_CARDS', 'BribeCardDefinition', t.bribeCards),
    '',
    tableDecl('OTHER_CARDS', 'OtherCardDefinition', t.otherCards),
    '',
    '// 各类牌的通用背面图（路径相对卡图根目录）。背面不是卡牌，不在上面任何一张牌表里',
    `export const CARD_BACK_IMAGES: CardBackImages = ${JSON.stringify(t.backImages, null, 2)};`,
    '',
    '// 牌种定义的条数：上面八张牌表的条目总数，不含背面',
    `export const CARD_DEFINITION_COUNT = ${counts.definitions};`,
    '',
    '// 数据明确给出张数的实体牌张数：角色牌（每种 1 张）、行动牌、梦魇牌、金库牌。',
    '// 不含梦境牌与其他牌（数据没给张数）和贿赂牌（张数随人数变化，见 quantityByPlayerCount）',
    `export const CARD_COPY_COUNT = ${counts.copies};`,
    '',
  ].join('\n');
}
