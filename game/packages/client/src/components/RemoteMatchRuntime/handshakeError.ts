// 握手被拒时该不该用错误页替换画面
// 对局结束后服务端只保留房间很短时间，之后重连会被拒；此时已经显示着结算画面，不应被错误页顶掉。

export function shouldShowHandshakeError(
  error: string | null,
  view: { ctx: { gameover?: unknown } } | null,
): boolean {
  if (!error) return false;
  return view?.ctx.gameover === undefined;
}
