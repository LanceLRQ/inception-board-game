// 万有引力池挑选弹窗的纯逻辑：轮到谁挑的显示名

/** 轮到本人显示「你」，其余玩家（真人对手与 Bot）一律显示对局里的昵称 */
export function pickerLabelOf(
  currentPicker: string,
  viewerPlayerID: string,
  nicknameOf: (playerID: string) => string,
): string {
  return currentPicker === viewerPlayerID ? '你' : nicknameOf(currentPicker);
}
