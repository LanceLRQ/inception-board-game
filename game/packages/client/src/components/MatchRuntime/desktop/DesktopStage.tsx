import { useMemo, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { MatchController } from '../controllerTypes';
import type { BoardModel } from '../model/boardModel';
import type { StageState } from '../model/stageState';
import { buildSeatViews, worldViewNames } from '../model/seatModel';
import { markersBySeat } from '../seatMarkers';
import { awaitedSeatIDs } from '../awaitingNotice';
import { TableBoard } from '../stages/table/TableBoard';
import { NoticeStack } from './NoticeStack';
import { SeatStatusBadges } from '../../SeatStatusBadges';
import { GameGuide } from '../../GameGuide';
import guide from '../../GameGuide/content.json';
import { getCardImageUrl } from '../../../lib/cardImages';
import { ChatBubble } from '../shared/ChatBubble';
import { CardArt } from '../../CardArt';
import { getCharacterSkillSummary } from '../../../lib/cards';

interface DesktopStageProps {
  readonly children: ReactNode;
  readonly readingCard: string | null;
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
  readingCard,
  children,
}: DesktopStageProps) {
  const reduced = useReducedMotion();

  const seats = useMemo(() => {
    const entries = buildSeatViews(
      state,
      controller.stage ? markersBySeat(controller.stage.seats) : undefined,
      controller.view ? awaitedSeatIDs(controller.view, state.viewerID) : [],
    );
    const index = entries.findIndex((s) => s.isCurrent);
    return index > 0 ? [...entries.slice(index), ...entries.slice(0, index)] : entries;
  }, [state, controller.stage, controller.view]);
  const self = seats.find((s) => s.isViewer);
  const info = self?.characterId ? getCharacterSkillSummary(self.characterId) : undefined;
  const card = readingCard
    ? Object.values(guide.cards).find((c) => c.id === readingCard)
    : undefined;
  return (
    <div className="tabletop-stage" data-testid="runtime-stage">
      <aside className="tabletop-players">
        <h2>
          同桌玩家 <small>{seats.length} 人</small>
        </h2>
        <div className="tabletop-player-list">
          {seats.map((seat) => (
            <motion.div
              layout={!reduced}
              transition={{ duration: 0.35 }}
              key={seat.id}
              className="tabletop-player"
              data-testid={`player-seat-${seat.id}`}
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
                <CardArt src={seat.imageUrl} />
              </button>
              <div>
                <b>
                  {seat.nickname}
                  {seat.isViewer ? ' · 你' : ''}
                </b>
                <p>{seat.characterName}</p>
                <small>
                  {seat.isLost ? '迷失层' : `${seat.layer} 层`} · 手牌 {seat.handCount}
                  {seat.isCurrent ? ' · 行动中' : ''}
                  {seat.isAwaited ? ' · 应答中' : ''}
                </small>
                <SeatStatusBadges markers={seat.markers} seatId={seat.id} size="sm" />
                <ChatBubble
                  entry={controller.chat.bubbles.get(seat.id)}
                  seatId={seat.id}
                  side="left"
                />
              </div>
            </motion.div>
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
        <div className="tabletop-reference-body">
          <h2>{card?.name ?? info?.name ?? '你的角色'}</h2>
          {card && (
            <>
              <button
                type="button"
                className="tabletop-reference-art"
                onClick={() => controller.preview.open(card.id)}
                aria-label="阅读完整卡牌解析"
              >
                <CardArt src={getCardImageUrl(card.id)} />
              </button>
              <p className="whitespace-pre-line">{card.fullText}</p>
            </>
          )}
          {!card && self?.characterId && (
            <button
              type="button"
              className="tabletop-reference-art"
              onClick={() => controller.preview.open(self.characterId!)}
              aria-label="阅读角色完整解析"
            >
              <CardArt src={self.imageUrl} />
            </button>
          )}
          {!card &&
            info?.skills.map((skill) => (
              <p key={skill.name}>
                <b>{skill.name}</b>
                <br />
                {skill.description}
              </p>
            ))}
          <h3>本局世界观</h3>
          {worldViewNames(controller.view).map((name) => (
            <p key={name}>{name}</p>
          ))}
        </div>
        <GameGuide />
      </aside>
      {children}
    </div>
  );
}
