// 对局详情与回放元信息共用：玩家列表与结果字段的映射
//
// 阵营、角色、胜负是对局内的隐藏信息：对局未结束时一律不返回，结束后才公开。

export interface MatchMetaPlayerRow {
  seat: number;
  nickname: string;
  isBot: boolean;
  role: string | null;
  finalFaction: string | null;
  won: boolean | null;
  abandoned: boolean | null;
}

export interface MatchMetaRow {
  id: string;
  roomId: string | null;
  ruleVariant: string | null;
  exEnabled: boolean | null;
  expansionEnabled: boolean | null;
  playerCount: number | null;
  startedAt: Date;
  endedAt: Date | null;
  winner: string | null;
  winReason: string | null;
  matchPlayers: MatchMetaPlayerRow[];
}

export interface MatchPlayerView {
  seat: number;
  nickname: string;
  isBot: boolean;
  role?: string | null;
  finalFaction?: string | null;
  won?: boolean | null;
  abandoned?: boolean | null;
}

/** 玩家列表映射：未结束只给座位、昵称与是否 Bot */
export function toMatchPlayerViews(
  match: Pick<MatchMetaRow, 'endedAt' | 'matchPlayers'>,
): MatchPlayerView[] {
  const finished = match.endedAt !== null;
  return match.matchPlayers.map((mp) => ({
    seat: mp.seat,
    nickname: mp.nickname,
    isBot: mp.isBot,
    ...(finished
      ? {
          role: mp.role,
          finalFaction: mp.finalFaction,
          won: mp.won,
          abandoned: mp.abandoned,
        }
      : {}),
  }));
}

/** 胜者与结算原因：未结束一律为空 */
export function toMatchOutcome(match: Pick<MatchMetaRow, 'endedAt' | 'winner' | 'winReason'>): {
  winner: string | null;
  winReason: string | null;
} {
  return match.endedAt === null
    ? { winner: null, winReason: null }
    : { winner: match.winner, winReason: match.winReason };
}
