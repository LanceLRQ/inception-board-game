// 一体式手牌坞：固定在底部、非模态、不遮罩
// 收起态：把手 + 本人身份块 + 横向手牌带 + 操作区（技能 / 主操作）。
// 展开态：把手 + 信息条（点牌读信息、「打出」按钮）+ 大卡网格 + 操作区。
// 点把手，或在把手 / 手牌带上上滑展开，下滑或再点把手收起（@use-gesture/react；动效遵循 prefers-reduced-motion）。
// 最底部一行常驻版权声明，让出底部安全区。
// 平板上牌更大、收起 / 展开的高度也更高；手机横屏（compact-landscape）没有收起态：
// 坞占满右栏，从上到下是信息条、可滚动的手牌网格、本人身份 + 操作区，没有把手。

import { useRef, useState } from 'react';
import { cn } from '../../../lib/utils';
import { useTranslation } from 'react-i18next';
import { useDrag } from '@use-gesture/react';
import { getAvailableActiveSkills } from '../../../lib/activeSkills';
import { CopyrightNotice } from '../../CopyrightNotice';
import type { MatchController } from '../controllerTypes';
import { DockInfoBar } from './DockInfoBar';
import { DockOps } from './DockOps';
import { DockSelfBlock } from './DockSelfBlock';
import { MobileHandCard } from './MobileHandCard';
import { ChatSheet } from './ChatSheet';
import { MobileSkillSheet } from './MobileSkillSheet';
import {
  cardCategoryOf,
  cardTargetKind,
  cardVerdict,
  isBlockedInAction,
} from '../model/handDerive';
import { sheetDragOutcome } from './sheetDrag';
import type { MobileMode } from '../viewportMode';

interface MobileDockProps {
  readonly controller: MatchController;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly mode: MobileMode;
}

/** 收起态内容高度（不含版权行与底部安全区），平板的牌更大 */
const PEEK_HEIGHT: Record<'phone' | 'tablet', number> = { phone: 142, tablet: 180 };
/** 展开态的最大高度：视口高度的比例封顶 */
const EXPANDED_HEIGHT: Record<'phone' | 'tablet', string> = {
  phone: 'min(56dvh, 478px)',
  tablet: 'min(52dvh, 600px)',
};

/** 坞的高度（CSS 值）；手机横屏由右栏的 flex 决定，返回 undefined */
export function dockHeight(open: boolean, mode: MobileMode): string | undefined {
  if (mode === 'compact-landscape') return undefined;
  const safe = 'env(safe-area-inset-bottom, 0px)';
  return open
    ? `calc(${EXPANDED_HEIGHT[mode]} + ${safe})`
    : `calc(${PEEK_HEIGHT[mode] + 20}px + ${safe})`;
}

export function MobileDock({ controller, open: openState, onOpenChange, mode }: MobileDockProps) {
  const compact = mode === 'compact-landscape';
  // 手机横屏没有收起态：始终按展开处理，但手牌用小牌网格
  const open = compact || openState;
  const { t } = useTranslation();
  const { hand, self, turn, winner, skillPanel, preview, play } = controller;
  const [reading, setReading] = useState<{ index: number; card: string; stamp: string } | null>(
    null,
  );
  // 读牌记录跟着回合与阶段走：换了阶段（抽牌后、进入弃牌等）自然失效
  const stamp = `${turn.number}:${turn.phase}`;
  const [skillOpen, setSkillOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const openChat = controller.chat.available ? () => setChatOpen(true) : undefined;
  const suppressClick = useRef(false);

  // 读牌记录只在那一格仍是同一张牌时有效，手牌变化后自然失效
  const readingItem =
    reading && reading.stamp === stamp && hand.items[reading.index]?.card === reading.card
      ? hand.items[reading.index]!
      : null;
  const verdictCtx = { isMyTurn: turn.isMine, turnPhase: turn.phase, winner };
  const inDiscard = turn.phase === 'discard' && hand.mustDiscard;

  const skills = skillPanel ? getAvailableActiveSkills(skillPanel.context) : [];
  const skillName = skills[0] ? t(skills[0].nameKey) : null;

  const handleTap = (index: number) => {
    const item = hand.items[index];
    if (!item) return;
    if (item.mode === 'discard') {
      // 弃牌：切换选中，不展开
      hand.tap(index);
      setReading({ index, card: item.card, stamp });
      return;
    }
    setReading(readingItem?.index === index ? null : { index, card: item.card, stamp });
    if (!open) onOpenChange(true);
  };

  const handleCommit = () => {
    if (!readingItem) return;
    play.commit(readingItem.card);
    setReading(null);
    onOpenChange(false);
  };

  const bindDrag = useDrag(
    ({ last, axis, movement: [, my], velocity: [, vy] }) => {
      if (axis !== 'y') return;
      if (Math.abs(my) > 10) suppressClick.current = true;
      if (!last) return;
      setTimeout(() => {
        suppressClick.current = false;
      }, 80);
      const outcome = sheetDragOutcome({ open, movementY: my, velocityY: Math.abs(vy) });
      if (outcome) onOpenChange(outcome === 'open');
    },
    { axis: 'lock', filterTaps: true, threshold: 6 },
  );

  const renderCards = (big: boolean) =>
    hand.items.map((item) => {
      const target = cardTargetKind(item.card);
      const caption = [
        t(`handInfo.category.${cardCategoryOf(item.card)}`),
        target ? t(`handInfo.target.${target}`) : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return (
        <MobileHandCard
          key={`${item.card}-${item.index}`}
          item={item}
          big={big}
          category={cardCategoryOf(item.card)}
          reading={readingItem?.index === item.index}
          blocked={isBlockedInAction(item, verdictCtx)}
          caption={caption}
          onTap={() => handleTap(item.index)}
          onDetail={() => preview.open(item.card)}
        />
      );
    });

  return (
    <section
      aria-label={t('dock.hand')}
      data-testid="hand-dock"
      data-open={open}
      data-mode={mode}
      className={cn(
        '@container relative z-10 box-border flex flex-col bg-panel pb-safe transition-[height] duration-300 ease-[cubic-bezier(.32,.72,.28,1)]',
        compact ? 'min-h-0 flex-1' : 'shrink-0 border-t border-line-strong',
      )}
      style={{ height: dockHeight(open, mode) }}
    >
      <div className="relative min-h-0 flex-1">
        {!compact && (
          <button
            type="button"
            {...bindDrag()}
            onClick={() => {
              if (suppressClick.current) return;
              onOpenChange(!open);
            }}
            aria-label={t('mobile.dock.grip')}
            aria-expanded={open}
            data-testid="dock-grip"
            className="absolute left-1/2 top-0 z-[2] h-8 w-[72px] -translate-x-1/2 cursor-pointer touch-none after:absolute after:inset-x-0 after:-top-3 after:bottom-0 after:content-[''] before:absolute before:left-1/2 before:top-2 before:h-1 before:w-[38px] before:-translate-x-1/2 before:rounded-sm before:bg-line-strong before:content-['']"
          />
        )}

        {compact ? (
          <div className="flex h-full min-h-0 flex-col" data-testid="dock-expanded">
            <DockInfoBar
              item={readingItem}
              verdict={readingItem ? cardVerdict(readingItem, verdictCtx) : null}
              discard={
                inDiscard
                  ? { selected: controller.actions.discardSelected, required: hand.overflow }
                  : null
              }
              onCommit={handleCommit}
            />
            <div
              className="flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto px-3 py-2"
              data-testid="human-hand"
            >
              {hand.available && hand.items.length > 0 ? (
                renderCards(false)
              ) : (
                <p className="text-[10px] text-faint">{t('dock.noHand')}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-1.5">
              {self && <DockSelfBlock self={self} skillName={skillName} onPreview={preview.open} />}
              <div className="min-w-0 flex-1">
                <DockOps
                  controller={controller}
                  skillReady={skills.length > 0}
                  onOpenSkill={() => setSkillOpen(true)}
                  onOpenChat={openChat}
                  layout="row"
                />
              </div>
            </div>
          </div>
        ) : !open ? (
          <div
            {...bindDrag()}
            className="flex h-full touch-pan-x items-center gap-2.5 px-3 pb-2 pt-9 tablet:gap-4 tablet:px-6"
            data-testid="dock-peek"
          >
            {self && <DockSelfBlock self={self} skillName={skillName} onPreview={preview.open} />}
            <div
              className="flex min-w-0 flex-1 touch-pan-x gap-2 overflow-x-auto px-0.5 pt-0.5 tablet:gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              data-testid="human-hand"
            >
              {hand.available && hand.items.length > 0 ? (
                renderCards(false)
              ) : (
                <p className="self-center text-[10px] text-faint">{t('dock.noHand')}</p>
              )}
            </div>
            <DockOps
              controller={controller}
              skillReady={skills.length > 0}
              onOpenSkill={() => setSkillOpen(true)}
              onOpenChat={openChat}
              layout="column"
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col pt-8" data-testid="dock-expanded">
            <div {...bindDrag()} className="touch-pan-x">
              <DockInfoBar
                item={readingItem}
                verdict={readingItem ? cardVerdict(readingItem, verdictCtx) : null}
                discard={
                  inDiscard
                    ? { selected: controller.actions.discardSelected, required: hand.overflow }
                    : null
                }
                onCommit={handleCommit}
              />
            </div>
            <div
              className="flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-y-auto px-4 pb-3 pt-3 tablet:gap-4 tablet:px-6"
              data-testid="human-hand"
            >
              {hand.available && hand.items.length > 0 ? (
                renderCards(true)
              ) : (
                <p className="text-[10px] text-faint">{t('dock.noHand')}</p>
              )}
            </div>
            <div className="shrink-0 border-t border-line px-4 pb-2 pt-2">
              <DockOps
                controller={controller}
                skillReady={skills.length > 0}
                onOpenSkill={() => setSkillOpen(true)}
                onOpenChat={openChat}
                layout="row"
              />
            </div>
          </div>
        )}
      </div>
      <div className="flex h-5 shrink-0 items-center justify-center px-3">
        <CopyrightNotice variant="line" className="w-full" />
      </div>
      <MobileSkillSheet open={skillOpen} onOpenChange={setSkillOpen} panel={skillPanel} />
      <ChatSheet open={chatOpen} onOpenChange={setChatOpen} controller={controller} />
    </section>
  );
}
