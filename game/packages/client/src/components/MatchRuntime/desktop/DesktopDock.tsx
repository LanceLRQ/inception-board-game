import { useTranslation } from 'react-i18next';
import { getSkillEntries } from '../../../lib/activeSkills';
import type { MatchController } from '../controllerTypes';
import {
  cardCategoryOf,
  cardTargetKind,
  cardVerdict,
  isBlockedInAction,
} from '../model/handDerive';
import { useHandSelection } from '../shared/HandSelection';
import { DockHandCard } from './DockHandCard';
import { DockOps } from './DockOps';

export function DesktopDock({ controller }: { controller: MatchController }) {
  const { t } = useTranslation();
  const { hand, turn, winner, skillPanel, preview, play, actions } = controller;
  const { readingItem, select } = useHandSelection();
  const verdictCtx = { isMyTurn: turn.isMine, turnPhase: turn.phase, winner };
  const verdict = readingItem ? cardVerdict(readingItem, verdictCtx) : null;
  const inDiscard = turn.phase === 'discard' && hand.mustDiscard;
  const skillEntries = skillPanel ? getSkillEntries(skillPanel.context) : [];
  const showActions = inDiscard ? actions.discardSelected > 0 : readingItem !== null;
  const note = inDiscard
    ? `选择 ${actions.discardRequired} 张弃牌，已选 ${actions.discardSelected} 张。`
    : verdict && !verdict.canPlay
      ? t(`handInfo.verdict.${verdict.reason}`)
      : readingItem
        ? `已选择 ${readingItem.name}`
        : '点选手牌后操作，再点一次取消。';

  return (
    <section aria-label={t('dock.hand')} data-testid="hand-dock" className="tabletop-hand-panel">
      <div className="tabletop-section-heading">
        <div className="tabletop-hand-title">
          <h2>我的手牌</h2>
          <span>{hand.items.length} 张</span>
        </div>
        <DockOps controller={controller} skillReady={skillEntries.length > 0} />
      </div>
      <div className="tabletop-hand" data-testid="human-hand">
        {hand.available && hand.items.length ? (
          hand.items.map((item) => {
            const target = cardTargetKind(item.card, controller.playRole);
            return (
              <DockHandCard
                key={`${item.card}-${item.index}`}
                item={item}
                category={cardCategoryOf(item.card)}
                targetText={target ? t(`desktop.hand.target.${target}`) : null}
                tilt={(item.index - (hand.items.length - 1) / 2) * 2}
                reading={readingItem?.index === item.index}
                blocked={isBlockedInAction(item, verdictCtx)}
                onTap={() => {
                  if (item.mode === 'discard') {
                    hand.tap(item.index);
                    select(item.index);
                  } else select(readingItem?.index === item.index ? null : item.index);
                }}
                onDetail={() => preview.open(item.card)}
              />
            );
          })
        ) : (
          <p className="tabletop-hand-empty">{t('dock.noHand')}</p>
        )}
      </div>
      <div className="tabletop-hand-actions">
        <p role="status">{note}</p>
        {showActions && (
          <div>
            {readingItem && (
              <button
                type="button"
                className="tabletop-secondary"
                onClick={() => preview.open(readingItem.card)}
              >
                查看解析
              </button>
            )}
            {inDiscard ? (
              <button
                type="button"
                className="tabletop-primary"
                data-testid="action-confirm-discard"
                disabled={!actions.canConfirmDiscard}
                onClick={actions.confirmDiscard}
              >
                弃掉 {actions.discardSelected} 张
              </button>
            ) : (
              readingItem && (
                <button
                  type="button"
                  className="tabletop-primary"
                  data-testid="hand-commit-play"
                  disabled={!verdict?.canPlay || play.pending !== null}
                  onClick={() => play.commit(readingItem.card)}
                >
                  打出 {readingItem.name}
                </button>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}
