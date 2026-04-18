// @icgame/shared - 共享类型与卡牌数据

// 阵营类型
export type Faction = 'thief' | 'master';

// 玩家状态
export interface Player {
  id: string;
  nickname: string;
  avatarSeed: number;
  faction?: Faction;
}
