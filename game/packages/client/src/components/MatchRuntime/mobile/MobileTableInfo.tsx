import { useState } from 'react';
import type { MatchController } from '../controllerTypes';
import type { StageState } from '../model/stageState';
import { buildSeatViews } from '../model/seatModel';
import { markersBySeat } from '../seatMarkers';
import { awaitedSeatIDs } from '../awaitingNotice';
import { getCharacterSkillSummary } from '../../../lib/cards';
import { Dialog, DialogTitle } from '../../ui/dialog';
import { PlayerAvatar } from '../../PlayerIdentity/PlayerAvatar';
import { PlayerName } from '../../PlayerIdentity/PlayerName';
import { SeatStatusBadges } from '../../SeatStatusBadges';

/** 层条保留头像；较长的同桌状态和世界观按需阅读。 */
export function MobileTableInfo({
  controller,
  state,
}: {
  controller: MatchController;
  state: StageState;
}) {
  const [open, setOpen] = useState(false);
  const seats = buildSeatViews(
    state,
    controller.stage ? markersBySeat(controller.stage.seats) : undefined,
    controller.view ? awaitedSeatIDs(controller.view, state.viewerID) : [],
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        同桌与世界观
      </button>
      <Dialog open={open} onOpenChange={setOpen} blocking={false} data-testid="mobile-table-info">
        <DialogTitle>同桌与世界观</DialogTitle>
        <div className="tabletop-mobile-seat-list">
          {seats.map((seat) => (
            <div key={seat.id}>
              <PlayerAvatar
                name={seat.nickname}
                characterId={seat.characterId}
                highlighted={seat.isViewer || seat.isCurrent}
                current={seat.isCurrent}
                onOpenCard={(id) => {
                  setOpen(false);
                  controller.preview.open(id);
                }}
              />
              <div>
                <strong>
                  <PlayerName name={seat.nickname} characterId={seat.characterId} />
                </strong>
                <p className="tabletop-player-status">
                  {seat.isCurrent && <span className="tabletop-turn-label">行动中</span>}
                  <span>{seat.isLost ? '迷失层' : `${seat.layer} 层`}</span>
                  <span>手牌 {seat.handCount}</span>
                  {seat.isAwaited && <span>应答中</span>}
                </p>
                <SeatStatusBadges markers={seat.markers} seatId={seat.id} size="sm" />
              </div>
            </div>
          ))}
        </div>
        {(controller.view?.activeWorldViews ?? []).map((id) => {
          const info = getCharacterSkillSummary(id);
          return (
            <section className="tabletop-world" key={id}>
              <strong>{info?.worldView?.name ?? info?.name}</strong>
              <p>{info?.worldView?.description}</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  controller.preview.open(id);
                }}
              >
                查看完整说明 ↗
              </button>
            </section>
          );
        })}
      </Dialog>
    </>
  );
}
