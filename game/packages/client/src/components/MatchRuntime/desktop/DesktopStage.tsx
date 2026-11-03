import { useMemo, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { resolveReducedMotion } from '../../../theme/effects';
import { useEffectsStore } from '../../../stores/useEffectsStore';
import type { MatchController } from '../controllerTypes';
import type { BoardModel } from '../model/boardModel';
import type { StageState } from '../model/stageState';
import { buildSeatViews } from '../model/seatModel';
import { markersBySeat } from '../seatMarkers';
import { awaitedSeatIDs } from '../awaitingNotice';
import { TableBoard } from '../stages/table/TableBoard';
import { NoticeStack } from './NoticeStack';
import { SeatStatusBadges } from '../../SeatStatusBadges';
import { GameGuide } from '../../GameGuide';
import { useHandSelection } from '../shared/HandSelection';
import { useTranslation } from 'react-i18next';
import { cardTargetKind } from '../model/handDerive';
import { getCardImageUrl } from '../../../lib/cardImages';
import { ChatBubble } from '../shared/ChatBubble';
import { CardArt } from '../../CardArt';
import { getCharacterSkillSummary, getCardMeta } from '../../../lib/cards';

const CARD_SUMMARIES: Record<string, string> = {
  action_shoot: '向同层的另一位玩家发起攻击，由目标玩家掷骰决定结果。',
  action_unlock: '解开所在层的一道心锁，或抵消另一张用于解锁的解封。',
  action_dream_transit: '穿过梦境的边界，移动到相邻的另一层。',
  action_kick: '与另一位玩家交换所在的梦境层。',
  action_dream_peek: '窥视金库或贿赂牌，具体效果取决于你的角色。查看结果仅对使用者可见。',
};

interface DesktopStageProps {
  readonly children: ReactNode;
  readonly controller: MatchController;
  readonly state: StageState;
  readonly board: BoardModel;
  readonly onFocusLayer: (layer: number) => void;
}
export function DesktopStage({
  controller,
  state,
  board,
  onFocusLayer,
  children,
}: DesktopStageProps) {
  const systemReduced = useReducedMotion();
  const motionPref = useEffectsStore((s) => s.prefs.motion);
  const reduced = resolveReducedMotion(motionPref, !!systemReduced);
  const listRef = useRef<HTMLDivElement>(null);
  const previous = useRef<{ current: string; order: string[] }>({ current: '', order: [] });

  const seats = useMemo(() => {
    const entries = buildSeatViews(
      state,
      controller.stage ? markersBySeat(controller.stage.seats) : undefined,
      controller.view ? awaitedSeatIDs(controller.view, state.viewerID) : [],
    );
    entries.sort((a, b) => state.playerOrder.indexOf(a.id) - state.playerOrder.indexOf(b.id));
    const index = entries.findIndex((s) => s.isCurrent);
    return index > 0 ? [...entries.slice(index), ...entries.slice(0, index)] : entries;
  }, [state, controller.stage, controller.view]);
  useLayoutEffect(() => {
    const list = listRef.current;
    const prior = previous.current;
    previous.current = { current: state.currentPlayerID, order: seats.map((s) => s.id) };
    if (!list || prior.current === state.currentPlayerID || !prior.current) return;
    list.scrollTop = 0;
    if (reduced) return;
    const offset = prior.order.indexOf(state.currentPlayerID);
    if (offset < 1) return;
    const elements = [...list.children] as HTMLElement[];
    const stride = elements[1] ? elements[1].offsetTop - elements[0]!.offsetTop : 0;
    const animations = elements.map((element, index) => {
      const oldIndex = prior.order.indexOf(seats[index]!.id);
      const wrapped = oldIndex < offset;
      return element.animate(
        [
          {
            transform: `translateY(${wrapped ? stride : (oldIndex - index) * stride}px)`,
            opacity: wrapped ? 0 : 1,
          },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
    });
    return () => animations.forEach((a) => a.cancel());
  }, [state.currentPlayerID, seats, reduced]);
  const worlds = (controller.view?.activeWorldViews ?? []).map((id) => ({
    id,
    info: getCharacterSkillSummary(id),
  }));
  const { t } = useTranslation();
  const { readingItem } = useHandSelection();
  const card = readingItem ? getCardMeta(readingItem.card) : undefined;
  const target = readingItem ? cardTargetKind(readingItem.card, controller.playRole) : null;
  return (
    <div className="tabletop-stage" data-testid="runtime-stage">
      <aside className="tabletop-players">
        <h2>
          同桌玩家 <small>{seats.length} 人</small>
        </h2>
        <div className="tabletop-player-list" ref={listRef}>
          {seats.map((seat) => (
            <div
              key={seat.id}
              className="tabletop-player"
              data-testid={`player-seat-${seat.id}`}
              data-master={seat.isMaster}
              data-self={seat.isViewer}
              data-current={seat.isCurrent}
              data-awaited={seat.isAwaited}
            >
              <button
                type="button"
                onClick={() => seat.characterId && controller.preview.open(seat.characterId)}
                disabled={!seat.characterId}
                aria-label={`查看${seat.nickname}角色`}
                data-testid={`player-avatar-${seat.id}`}
              >
                <CardArt src={seat.imageUrl} trimBorder={false} />
              </button>
              <div>
                <b>
                  {seat.nickname}
                  {seat.isMaster
                    ? ' · 梦主'
                    : seat.isViewer && seat.nickname !== '你'
                      ? ' · 你'
                      : ''}
                  {seat.isCurrent && <em className="tabletop-turn-label">行动中</em>}
                </b>
                <p>{seat.characterName}</p>
                <small>
                  {seat.isLost ? '迷失层' : `${seat.layer} 层`} · 手牌 {seat.handCount}
                  {seat.isAwaited ? ' · 应答中' : ''}
                </small>
                <SeatStatusBadges markers={seat.markers} seatId={seat.id} size="sm" />
                <ChatBubble
                  entry={controller.chat.bubbles.get(seat.id)}
                  seatId={seat.id}
                  side="left"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="tabletop-world">
          <span>本局世界观</span>
          {worlds.map(({ id, info }) => (
            <div key={id}>
              <strong>{info?.worldView?.name ?? info?.name}</strong>
              <p>{info?.worldView?.description}</p>
              <button type="button" onClick={() => controller.preview.open(id)}>
                查看梦主完整说明 ↗
              </button>
            </div>
          ))}
        </div>
      </aside>
      <section className="tabletop-center" data-testid="center-stage">
        <div className="tabletop-heading">
          <h2>梦境</h2>
          <span>
            你在
            {board.viewerLayer === 0 ? '迷失层' : `第 ${board.viewerLayer} 层`}
          </span>
        </div>
        <TableBoard
          board={board}
          onFocusLayer={onFocusLayer}
          onOpenCard={controller.preview.open}
        />
        <NoticeStack controller={controller} onReserve={() => {}} />
      </section>
      <aside className="tabletop-reference">
        <div className="tabletop-section-heading">
          <h2>卡牌介绍</h2>
          <span>{card ? '行动牌' : '尚未选择'}</span>
        </div>
        <div className="tabletop-reference-body">
          {card && readingItem ? (
            <>
              <button
                type="button"
                className="tabletop-reference-art"
                onClick={() => controller.preview.open(readingItem.card)}
                aria-label="阅读完整卡牌解析"
              >
                <CardArt src={getCardImageUrl(readingItem.card)} trimBorder={false} />
                <span>点击查看解析</span>
              </button>
              <h3>{readingItem.name}</h3>
              <p>
                {CARD_SUMMARIES[readingItem.card] ??
                  ('description' in card ? card.description.split(/[。；\n]/)[0] : '')}
              </p>
              <small>使用目标</small>
              <p>{target ? t(`desktop.hand.target.${target}`) : '无需目标'}</p>
              <small>关键效果</small>
              <p>{card.category === 'action' ? card.description : ''}</p>
            </>
          ) : (
            <>
              <h3>选一张手牌</h3>
              <p>这里显示卡牌介绍与完整解析。游戏流程和全部卡牌可在下方说明书中查看。</p>
            </>
          )}
        </div>
        <GameGuide />
      </aside>
      {children}
    </div>
  );
}
