// 盘面数据模型：各层的心锁 / 金库 / 梦魇 / 占位者，牌库进度，回合横幅，最新动态，焦点层
// 与主题无关：移动端层塔与桌面端所有主题的中央舞台都吃这同一份，各自决定怎么摆。
// 只读按座位裁剪后的视图（经 StageState 转换）；梦主能看到的额外信息（未翻开的梦魇、
// 未开金库的内容）取决于视图里是否带了这些字段，这里不做任何权限判断，有什么显示什么。

import type { MatchView } from '@icgame/game-engine';
import type { StageState, StageVault } from './stageState';
import { getCharacterSkillSummary } from '../../../lib/cards';
import type { Activity } from './activity';

/** 盘面从上到下的层号：第 4 层在上，最下是迷失层 */
export const BOARD_LAYERS = [4, 3, 2, 1, 0] as const;

/** 金库内容在界面里用的卡面编号 */
export type VaultFace = 'vault_back' | 'vault_secret' | 'vault_gold';

export interface BoardVault {
  readonly id: string;
  readonly opened: boolean;
  readonly contentType: StageVault['contentType'];
  /** 缩略图与详情用的卡面：未开的金库一律是背面 */
  readonly face: VaultFace;
}

export interface BoardNightmare {
  readonly revealed: boolean;
  /** 能看到的梦魇牌；看不到（盗梦者面对未翻开的梦魇）为 null */
  readonly cardId: string | null;
}

export interface BoardOccupant {
  readonly id: string;
  readonly name: string;
  /** 像素头像种子（公开信息） */
  readonly avatarSeed: string;
  readonly isSelf: boolean;
  readonly isMaster: boolean;
  readonly isCurrent: boolean;
  /** 已翻开（或本人 / 梦主）的角色牌；其余为 null，不显示角色名 */
  readonly characterId: string | null;
  readonly characterName: string | null;
}

/** i18n 文案：键 + 参数 */
export interface BoardText {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

export interface BoardLayer {
  readonly layer: number;
  readonly heartLock: number;
  readonly vaults: readonly BoardVault[];
  /** 这一层有梦魇信息可显示才有值 */
  readonly nightmare: BoardNightmare | null;
  readonly occupants: readonly BoardOccupant[];
  /** 本人所在层 */
  readonly hasViewer: boolean;
  /** 有人正在这一层打出【解封】、响应窗口开启中 */
  readonly unlocking: boolean;
  /** 焦点层多出来的一行说明 */
  readonly note: BoardText;
}

/** 回合横幅：谁的回合 + 当前阶段（阶段文案键另给，由舞台自行拼接） */
export interface BoardBanner extends BoardText {
  readonly phaseKey: string;
}

export interface BoardDeck {
  readonly remaining: number;
  /** 按公开信息推算的牌总数：牌库 + 弃牌堆 + 各人手牌数 + 移出游戏的牌 */
  readonly total: number;
}

export interface BoardModel {
  /** 第 4 层 → 迷失层 */
  readonly layers: readonly BoardLayer[];
  readonly focusLayer: number;
  readonly viewerLayer: number;
  readonly deck: BoardDeck;
  readonly turn: { readonly number: number; readonly phase: string };
  readonly banner: BoardBanner;
  /** 最新动态；没有可显示的内容为 null */
  readonly activity: Activity | null;
}

const OPENED_FACE: Record<'secret' | 'coin' | 'empty', VaultFace> = {
  secret: 'vault_secret',
  coin: 'vault_gold',
  empty: 'vault_back',
};

/** 一座金库的展示数据；已开的金库按内容显示卡面，未开的显示背面 */
export function boardVaultOf(vault: StageVault): BoardVault {
  const face =
    vault.isOpened && vault.contentType !== 'hidden'
      ? OPENED_FACE[vault.contentType]
      : 'vault_back';
  return { id: vault.id, opened: vault.isOpened, contentType: vault.contentType, face };
}

type PendingUnlock = { playerID: string; layer: number } | null | undefined;

/** 焦点层的说明：解封进行中点名发起者，否则说这一层有几个人 */
export function deriveLayerNote(
  layer: { layer: number; occupants: readonly unknown[] },
  pendingUnlock: PendingUnlock,
  nicknameOf: (playerID: string) => string,
): BoardText {
  if (pendingUnlock && pendingUnlock.layer === layer.layer) {
    return { key: 'board.tower.noteUnlock', params: { name: nicknameOf(pendingUnlock.playerID) } };
  }
  if (layer.occupants.length === 0) return { key: 'board.tower.noteEmpty', params: {} };
  return { key: 'board.tower.noteOccupants', params: { n: layer.occupants.length } };
}

/** 构造每一层的数据（顺序见 BOARD_LAYERS） */
export function buildBoardLayers(
  state: StageState,
  layersView: MatchView['layers'] | undefined,
  pendingUnlock: PendingUnlock,
  nicknameOf: (playerID: string) => string,
): BoardLayer[] {
  const viewer = state.players[state.viewerID];
  return BOARD_LAYERS.map((layer) => {
    const stageLayer = state.layers[layer];
    const raw = layersView?.[layer];
    const ids = stageLayer?.playersInLayer ?? [];
    // 迷失层按玩家当前所在层补齐：被淘汰的玩家也可能不在 playersInLayer 里
    const inLayer =
      layer === 0
        ? Object.values(state.players)
            .filter((p) => p.currentLayer === 0 || !p.isAlive)
            .map((p) => p.id)
        : ids;
    const occupants: BoardOccupant[] = [...new Set(inLayer)].flatMap((id) => {
      const p = state.players[id];
      if (!p) return [];
      const isSelf = id === state.viewerID;
      const isMaster = id === state.dreamMasterID;
      const characterId =
        (isSelf || isMaster || p.isRevealed) && p.characterId ? p.characterId : null;
      return [
        {
          id,
          name: p.nickname,
          avatarSeed: p.avatarSeed,
          isSelf,
          isMaster,
          isCurrent: id === state.currentPlayerID,
          characterId,
          characterName: characterId ? (getCharacterSkillSummary(characterId)?.name ?? null) : null,
        },
      ];
    });

    let nightmare: BoardNightmare | null = null;
    if (raw) {
      const cardId = raw.nightmareId ?? null;
      if (raw.nightmareRevealed || cardId) {
        nightmare = { revealed: !!raw.nightmareRevealed, cardId };
      }
    } else if (stageLayer?.nightmareRevealed) {
      nightmare = { revealed: true, cardId: null };
    }

    return {
      layer,
      heartLock: stageLayer?.heartLockValue ?? 0,
      vaults: state.vaults.filter((v) => v.layer === layer).map(boardVaultOf),
      nightmare,
      occupants,
      hasViewer: !!viewer && viewer.currentLayer === layer,
      unlocking: !!pendingUnlock && pendingUnlock.layer === layer,
      note: deriveLayerNote({ layer, occupants }, pendingUnlock, nicknameOf),
    };
  });
}

/** 回合横幅：本人回合与别人回合各一句，阶段文案键另给 */
export function deriveBanner(input: {
  readonly isMine: boolean;
  readonly actorName: string;
  /** 行动者已翻开的角色名；没有为 null */
  readonly characterName: string | null;
  readonly phase: string;
}): BoardBanner {
  const actor = input.characterName
    ? `${input.actorName} · ${input.characterName}`
    : input.actorName;
  return {
    key: input.isMine ? 'board.banner.mine' : 'board.banner.other',
    params: { actor },
    phaseKey: `localMatch.phase.${input.phase}`,
  };
}

/** 牌库进度：剩余与按公开信息推算的总数（总数不小于剩余） */
export function deriveDeck(state: StageState, view: MatchView | undefined): BoardDeck {
  const hands = Object.values(state.players).reduce((sum, p) => sum + p.handCount, 0);
  const total =
    state.deckCount + state.discardPile.length + hands + (view?.removedFromGame?.length ?? 0);
  return { remaining: state.deckCount, total: Math.max(total, state.deckCount) };
}

export interface BoardInput {
  readonly state: StageState;
  readonly view: MatchView | undefined;
  readonly focusLayer: number;
  readonly activity: Activity | null;
  readonly nicknameOf: (playerID: string) => string;
}

/** 行动者已翻开（或就是本人 / 梦主）的角色名；没有为 null */
export function currentCharacterNameOf(state: StageState): string | null {
  const p = state.players[state.currentPlayerID];
  if (!p?.characterId) return null;
  const known = p.isRevealed || p.id === state.viewerID || p.id === state.dreamMasterID;
  return known ? (getCharacterSkillSummary(p.characterId)?.name ?? null) : null;
}

export function buildBoardModel(input: BoardInput): BoardModel {
  const { state, view, focusLayer, activity, nicknameOf } = input;
  const pendingUnlock = view?.pendingUnlock ?? state.pendingUnlock;
  const viewer = state.players[state.viewerID];
  return {
    layers: buildBoardLayers(state, view?.layers, pendingUnlock, nicknameOf),
    focusLayer,
    viewerLayer: viewer?.currentLayer ?? 1,
    deck: deriveDeck(state, view),
    turn: { number: state.turnNumber, phase: state.turnPhase },
    banner: deriveBanner({
      isMine: state.currentPlayerID === state.viewerID,
      actorName: nicknameOf(state.currentPlayerID),
      characterName: currentCharacterNameOf(state),
      phase: state.turnPhase,
    }),
    activity,
  };
}

/** 焦点层的选择：点按标签时记下当时本人所在的层 */
export interface FocusPick {
  readonly layer: number;
  readonly viewerLayer: number;
}

/**
 * 焦点层：缺省为本人所在层；点选后固定在所选层，直到本人换层，之后重新跟随本人。
 */
export function resolveFocusLayer(pick: FocusPick | null, viewerLayer: number): number {
  return pick && pick.viewerLayer === viewerLayer ? pick.layer : viewerLayer;
}

/** 层级标签：层号、心锁值、是否有金库已开 */
export interface LayerChip {
  readonly layer: number;
  readonly heartLock: number;
  readonly anyVaultOpened: boolean;
}

export function buildLayerChips(layers: readonly BoardLayer[]): LayerChip[] {
  // 标签从迷失层到第 4 层
  return [...layers]
    .sort((a, b) => a.layer - b.layer)
    .map((r) => ({
      layer: r.layer,
      heartLock: r.heartLock,
      anyVaultOpened: r.vaults.some((v) => v.opened),
    }));
}

/** 展开手牌坞时层塔只保留焦点层 */
export function visibleBoardLayers(
  layers: readonly BoardLayer[],
  focusLayer: number,
  dockOpen: boolean,
): BoardLayer[] {
  return dockOpen ? layers.filter((r) => r.layer === focusLayer) : [...layers];
}
