// 对局运行时 · 只依赖 MatchSource：状态从哪来（本机 Worker / 服务端）由来源决定
//
// 结构：控制层 useMatchController（状态推导与交互流程）+ 布局 + 弹窗群 MatchDialogs
//   ≥1024px 用 ClassicLayout；<1024px 用占满视口的 MobileLayout（解封响应改由它的响应条承载，不再弹窗）

import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { MatchSource } from '../../match/matchSource';
import { ClassicLayout } from './ClassicLayout';
import { MatchDialogs } from './MatchDialogs';
import { MobileLayout } from './mobile/MobileLayout';
import { useMatchController } from './useMatchController';

interface MatchRuntimeProps {
  readonly source: MatchSource;
  /** 顶部状态栏右上角补充文字（好友房可显示房间码） */
  readonly topRight?: React.ReactNode;
  /** 点「再来一局」时的回调 */
  readonly onRestart?: () => void;
}

export function MatchRuntime({ source, topRight, onRestart }: MatchRuntimeProps) {
  const controller = useMatchController(source);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  if (isDesktop) {
    return (
      <ClassicLayout controller={controller} topRight={topRight} onRestart={onRestart}>
        <MatchDialogs controller={controller} />
      </ClassicLayout>
    );
  }
  return (
    <>
      <MobileLayout controller={controller} topRight={topRight} onRestart={onRestart} />
      <MatchDialogs controller={controller} skipUnlockResponse />
    </>
  );
}
