// 对局运行时 · 只依赖 MatchSource：状态从哪来（本机 Worker / 服务端）由来源决定
//
// 结构：控制层 useMatchController（状态推导与交互流程）+ 布局 + 弹窗群 MatchDialogs
//   ≥1024px 用占满视口的 DesktopLayout，<1024px 用占满视口的 MobileLayout；
//   两个布局都用内联的响应窗口 / 响应条承载解封响应，不再弹窗

import { useMediaQuery } from '../../hooks/useMediaQuery';
import { MatchAssetGate } from '../AssetLoadingScreen';
import type { MatchSource } from '../../match/matchSource';
import { DesktopLayout } from './desktop/DesktopLayout';
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
  return (
    <>
      {isDesktop ? (
        <DesktopLayout controller={controller} topRight={topRight} onRestart={onRestart} />
      ) : (
        <MobileLayout controller={controller} topRight={topRight} onRestart={onRestart} />
      )}
      <MatchDialogs controller={controller} />
      <MatchAssetGate entry={controller.entryAssets} />
    </>
  );
}
