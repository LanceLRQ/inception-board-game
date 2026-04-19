// @icgame/bot - AI Bot

export interface Bot {
  play(state: unknown, legalMoves: string[]): string;
}

// L1 随机策略 Bot
export class RandomBot implements Bot {
  play(_state: unknown, legalMoves: string[]): string {
    if (legalMoves.length === 0) {
      throw new Error('No legal moves available');
    }
    const idx = Math.floor(Math.random() * legalMoves.length);
    return legalMoves[idx]!;
  }
}
