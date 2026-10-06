// 中央舞台的对外接口：所有主题的中央舞台吃同一份盘面数据，结构各自不同
// 中央舞台只负责中央区的展示：出牌、选目标在底部坞与弹窗里，这里不处理。
// 金库缩略图可点开详情（详情禁止翻面）；梦境层牌不触发详情。

import type { BoardModel } from '../model/boardModel';

export interface CenterStageProps {
  /** 盘面数据（与主题无关） */
  readonly board: BoardModel;
  /** 把某一层设为焦点层 */
  readonly onFocusLayer: (layer: number) => void;
  /** 打开卡牌详情：金库卡面编号或梦魇牌编号 */
  readonly onOpenCard: (cardId: string) => void;
}
