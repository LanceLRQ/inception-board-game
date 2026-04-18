// @icgame/bot - AI Bot

export interface Bot {
  play(state: unknown, legalMoves: string[]): string;
}
