// 底部坞：本人身份块 + 手牌 + 操作区，最底部一行常驻版权声明
// 手牌多时坞内横向滚动，不撑高坞。高度随视口高度变化（clamp），整页不滚动。
// 弃牌阶段点牌切换选中；行动阶段点牌选中，再点「打出」才进入出牌流程（两步出牌）。
// 样式钩子类名：ms-dock。

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAvailableActiveSkills } from '../../../lib/activeSkills';
import { CopyrightNotice } from '../../CopyrightNotice';
import type { MatchController } from '../controllerTypes';
import {
  cardCategoryOf,
  cardTargetKind,
  cardVerdict,
  isBlockedInAction,
} from '../model/handDerive';
import { markersBySeat } from '../seatMarkers';
import { DockHandCard } from './DockHandCard';
import { DockOps } from './DockOps';
import { DockSelf } from './DockSelf';

interface DesktopDockProps {
  readonly controller: MatchController;
}

export function DesktopDock({ controller }: DesktopDockProps) {
  const { t } = useTranslation();
  const { hand, self, turn, winner, skillPanel, preview, play, stage } = controller;
  const [reading, setReading] = useState<{ index: number; card: string; stamp: string } | null>(
    null,
  );
  // 选中记录跟着回合与阶段走：换了阶段（抽牌后、进入弃牌等）自然失效
  const stamp = `${turn.number}:${turn.phase}`;

  // 选中记录只在那一格仍是同一张牌时有效，手牌变化后自然失效
  const readingItem =
    reading && reading.stamp === stamp && hand.items[reading.index]?.card === reading.card
      ? hand.items[reading.index]!
      : null;
  const verdictCtx = { isMyTurn: turn.isMine, turnPhase: turn.phase, winner };
  const verdict = readingItem ? cardVerdict(readingItem, verdictCtx) : null;

  // 选中的牌此刻打不出时，把原因写在身份块里（桌面没有信息条）
  const readingNote =
    verdict && !verdict.canPlay && verdict.reason !== 'discardPhase'
      ? t(`handInfo.verdict.${verdict.reason}`)
      : null;
  const skills = skillPanel ? getAvailableActiveSkills(skillPanel.context) : [];
  const skillName = skills[0] ? t(skills[0].nameKey) : null;
  const selfMarkers = stage && self ? (markersBySeat(stage.seats)[self.seat] ?? []) : [];

  const handleTap = (index: number) => {
    const item = hand.items[index];
    if (!item) return;
    if (item.mode === 'discard') {
      hand.tap(index);
      return;
    }
    setReading(readingItem?.index === index ? null : { index, card: item.card, stamp });
  };

  const handleCommit = () => {
    if (!readingItem) return;
    play.commit(readingItem.card);
    setReading(null);
  };

  return (
    <section
      aria-label={t('dock.hand')}
      data-testid="hand-dock"
      className="ms-dock relative z-10 box-border flex shrink-0 flex-col"
      style={{ height: 'clamp(164px, calc(25dvh / var(--ms-scale, 1)), 250px)' }}
    >
      <div className="flex min-h-0 flex-1 px-4 pb-1 pt-2">
        {self && (
          <DockSelf
            self={self}
            handCount={hand.items.length}
            skillName={skillName}
            mustDiscard={turn.phase === 'discard' && hand.mustDiscard ? hand.overflow : 0}
            markers={selfMarkers}
            readingNote={readingNote}
            bubble={controller.chat.bubbles.get(self.seat)}
            onPreview={preview.open}
          />
        )}
        <div
          className="flex min-w-0 flex-1 items-end gap-2.5 overflow-x-auto overflow-y-hidden px-3 pb-0.5 pt-4 [scrollbar-width:thin]"
          data-testid="human-hand"
        >
          {hand.available && hand.items.length > 0 ? (
            hand.items.map((item) => {
              const target = cardTargetKind(item.card, controller.playRole);
              return (
                <DockHandCard
                  key={`${item.card}-${item.index}`}
                  item={item}
                  category={cardCategoryOf(item.card)}
                  targetText={target ? t(`desktop.hand.target.${target}`) : null}
                  reading={readingItem?.index === item.index}
                  blocked={isBlockedInAction(item, verdictCtx)}
                  onTap={() => handleTap(item.index)}
                  onDetail={() => preview.open(item.card)}
                />
              );
            })
          ) : (
            <p className="self-center text-xs text-faint">{t('dock.noHand')}</p>
          )}
        </div>
        <DockOps
          controller={controller}
          commitName={verdict?.canPlay && readingItem ? readingItem.name : null}
          onCommit={handleCommit}
          skillReady={skills.length > 0}
        />
      </div>
      <div className="flex h-5 shrink-0 items-center justify-center px-3">
        <CopyrightNotice variant="line" className="w-full" />
      </div>
    </section>
  );
}
