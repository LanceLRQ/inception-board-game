// 对局动画层：铺在整个对局界面之上、不接收指针，按事件播放抽牌、出牌、弃牌、转牌、
// 移层、击杀与复活、心锁变化、金库打开。每个动作配一行说明（读屏也会念）。
// 「减少动效」开启时不播飞行与闪烁，只显示说明。起止点见 anchors.ts。

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotionConfig } from 'framer-motion';
import { Footprints, HeartPulse, Lock, Skull, Vault } from 'lucide-react';
import { getCardImageUrl } from '../../../lib/cardImages';
import { getCardName } from '../../../lib/cards';
import type { MatchSource } from '../../../match/matchSource';
import { CardArt } from '../../CardArt';
import {
  DECK_SELECTORS,
  DISCARD_SELECTORS,
  PLAYED_SELECTORS,
  centerOf,
  layerSelectors,
  locate,
  seatSelectors,
  viewportCenter,
  type FxRect,
} from './anchors';
import type { FxCue } from './cues';
import type { PlayingCue } from './fxQueue';
import { useFxPlayer } from './useFxPlayer';

/** 一个动作里最多飞几张牌（再多也只是更密，不更清楚） */
const MAX_FLYING = 4;
const CARD_BACK = 'action_back';

interface MatchFxProps {
  readonly source: MatchSource;
  readonly nicknameOf: (playerID: string) => string;
}

export function MatchFx({ source, nicknameOf }: MatchFxProps) {
  const playing = useFxPlayer(source.events);
  const reduced = useReducedMotionConfig() === true;
  const caption = useCaption(playing?.cue ?? null, source.seat, nicknameOf);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      data-testid="match-fx"
      data-cue={playing?.cue.kind}
      aria-hidden={playing === null ? true : undefined}
    >
      {playing && !reduced && (
        <CueAnimation key={playing.id} playing={playing} viewer={source.seat} />
      )}
      <p
        role="status"
        aria-live="polite"
        className="ms-fx-caption absolute top-[calc(env(safe-area-inset-top,0px)+3.25rem)] left-1/2 max-w-[90vw] -translate-x-1/2 truncate px-3 py-1 text-xs"
        data-testid="fx-caption"
        hidden={caption === null}
      >
        {caption}
      </p>
    </div>
  );
}

/** 说明文字：谁做了什么 */
function useCaption(
  cue: FxCue | null,
  viewer: string | null,
  nicknameOf: (id: string) => string,
): string | null {
  const { t } = useTranslation();
  if (cue === null) return null;
  const name = (id: string) => (id === viewer ? t('fx.you') : nicknameOf(id));
  switch (cue.kind) {
    case 'draw':
      return t('fx.draw', { name: name(cue.player), n: cue.count });
    case 'play':
      return t('fx.play', { name: name(cue.player), card: getCardName(cue.card) });
    case 'discard':
      return cue.player === null
        ? t('fx.discardLoose', { n: cue.cards.length })
        : t('fx.discard', { name: name(cue.player), n: cue.cards.length });
    case 'transfer':
      return t('fx.transfer', { from: name(cue.from), to: name(cue.to), n: cue.count });
    case 'move':
      return t('fx.move', { name: name(cue.player), from: cue.from, to: cue.to });
    case 'died':
      return t('fx.died', { name: name(cue.player) });
    case 'revived':
      return t('fx.revived', { name: name(cue.player), layer: cue.layer });
    case 'lock':
      return t('fx.lock', { layer: cue.layer, from: cue.from, to: cue.to });
    case 'vault':
      return t('fx.vault', {
        layer: cue.layer,
        content: t(`board.tower.vaultContent.${cue.content}`, { defaultValue: cue.content }),
      });
  }
}

/** 飞行的牌的尺寸：窄屏小一号 */
function cardSize(): { w: number; h: number } {
  return window.innerWidth < 1024 ? { w: 36, h: 50 } : { w: 56, h: 78 };
}

interface FlightProps {
  readonly from: FxRect;
  readonly to: FxRect;
  readonly card: string;
  readonly delay: number;
  readonly duration: number;
}

/** 一张牌从 from 的中心飞到 to 的中心，落地时缩小淡出 */
function FlyingCard({ from, to, card, delay, duration }: FlightProps) {
  const { w, h } = cardSize();
  const a = centerOf(from);
  const b = centerOf(to);
  return (
    <motion.div
      className="ms-fx-card absolute top-0 left-0 overflow-hidden"
      style={{ width: w, height: h }}
      initial={{ x: a.x - w / 2, y: a.y - h / 2, opacity: 0, scale: 0.8 }}
      animate={{
        x: [a.x - w / 2, b.x - w / 2],
        y: [a.y - h / 2, b.y - h / 2],
        opacity: [0, 1, 1, 0],
        scale: [0.8, 1, 1, 0.7],
      }}
      transition={{ duration, delay, ease: 'easeInOut', times: [0, 0.15, 0.8, 1] }}
    >
      <CardArt src={getCardImageUrl(card)} className="size-full" />
    </motion.div>
  );
}

/** 一组牌依次飞出（间隔按总时长均分，最多 MAX_FLYING 张） */
function Flights({
  from,
  to,
  cards,
  seconds,
}: {
  from: FxRect;
  to: FxRect;
  cards: readonly string[];
  seconds: number;
}) {
  const shown = cards.slice(0, MAX_FLYING);
  const flight = seconds * 0.7;
  const gap = shown.length > 1 ? (seconds - flight) / (shown.length - 1) : 0;
  return (
    <>
      {shown.map((card, i) => (
        <FlyingCard key={i} from={from} to={to} card={card} delay={i * gap} duration={flight} />
      ))}
    </>
  );
}

/** 出牌：从出牌人飞到屏幕中央放大亮相，再落进本回合出牌区 */
function PlayedCard({ from, card, seconds }: { from: FxRect; card: string; seconds: number }) {
  const { w, h } = cardSize();
  const big = { w: w * 2.2, h: h * 2.2 };
  const a = centerOf(from);
  const mid = centerOf(viewportCenter());
  const end = centerOf(locate(PLAYED_SELECTORS));
  const pos = (p: { x: number; y: number }) => ({ x: p.x - big.w / 2, y: p.y - big.h / 2 });
  return (
    <motion.div
      className="ms-fx-card absolute top-0 left-0 overflow-hidden"
      style={{ width: big.w, height: big.h }}
      initial={{ ...pos(a), scale: 0.4, opacity: 0 }}
      animate={{
        x: [pos(a).x, pos(mid).x, pos(mid).x, pos(end).x],
        y: [pos(a).y, pos(mid).y, pos(mid).y, pos(end).y],
        scale: [0.4, 1, 1, 0.3],
        opacity: [0, 1, 1, 0],
      }}
      transition={{ duration: seconds, times: [0, 0.3, 0.75, 1], ease: 'easeInOut' }}
      data-testid="fx-played-card"
    >
      <CardArt src={getCardImageUrl(card)} alt={getCardName(card)} className="size-full" />
    </motion.div>
  );
}

/** 叠在某个区域上的一次闪现：图标 + 文字，淡入、停留、淡出 */
function Flash({
  at,
  tone,
  icon,
  text,
  seconds,
  rise = false,
}: {
  at: FxRect;
  tone: 'blood' | 'lock' | 'acc';
  icon: React.ReactNode;
  text?: string;
  seconds: number;
  rise?: boolean;
}) {
  const c = centerOf(at);
  return (
    <>
      {at.w > 0 && (
        <motion.div
          className="ms-fx-ring absolute"
          data-tone={tone}
          style={{ left: at.x, top: at.y, width: at.w, height: at.h }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{ duration: seconds, times: [0, 0.2, 0.7, 1] }}
        />
      )}
      <motion.div
        className="ms-fx-badge absolute top-0 left-0 flex items-center gap-1.5 px-2 py-1 font-mono text-sm font-bold"
        data-tone={tone}
        initial={{ x: c.x, y: c.y, opacity: 0, scale: 0.6 }}
        animate={{
          x: c.x,
          y: rise ? [c.y, c.y - 28] : c.y,
          opacity: [0, 1, 1, 0],
          scale: [0.6, 1.1, 1, 1],
        }}
        transition={{ duration: seconds, times: [0, 0.2, 0.75, 1] }}
        style={{ translateX: '-50%', translateY: '-50%' }}
      >
        {icon}
        {text && <span className="whitespace-nowrap">{text}</span>}
      </motion.div>
    </>
  );
}

/** 起止点在动作开始时量一次（之后视图怎么变都不跟着跳） */
function CueAnimation({ playing, viewer }: { playing: PlayingCue; viewer: string | null }) {
  const { t } = useTranslation();
  const { cue, durationMs } = playing;
  const seconds = durationMs / 1000;
  const seat = (id: string | null) =>
    id === null ? locate(DECK_SELECTORS) : locate(seatSelectors(id, viewer));
  const backs = (n: number) => Array.from({ length: Math.min(n, MAX_FLYING) }, () => CARD_BACK);

  // 动作开始那一刻的位置；依赖只有动作编号
  const content = useMemo(() => {
    switch (cue.kind) {
      case 'draw':
        return (
          <Flights
            from={locate(DECK_SELECTORS)}
            to={seat(cue.player)}
            cards={cue.cards ?? backs(cue.count)}
            seconds={seconds}
          />
        );
      case 'play':
        return <PlayedCard from={seat(cue.player)} card={cue.card} seconds={seconds} />;
      case 'discard':
        return (
          <Flights
            from={seat(cue.player)}
            to={locate(DISCARD_SELECTORS)}
            cards={cue.cards}
            seconds={seconds}
          />
        );
      case 'transfer':
        return (
          <Flights
            from={seat(cue.from)}
            to={seat(cue.to)}
            cards={cue.cards ?? backs(cue.count)}
            seconds={seconds}
          />
        );
      case 'move': {
        const a = centerOf(locate(layerSelectors(cue.from)));
        const b = centerOf(locate(layerSelectors(cue.to)));
        return (
          <motion.div
            className="ms-fx-badge absolute top-0 left-0 flex items-center gap-1 px-2 py-1 text-xs"
            data-tone="acc"
            style={{ translateX: '-50%', translateY: '-50%' }}
            initial={{ x: a.x, y: a.y, opacity: 0 }}
            animate={{ x: [a.x, b.x], y: [a.y, b.y], opacity: [0, 1, 1, 0] }}
            transition={{ duration: seconds, times: [0, 0.15, 0.85, 1], ease: 'easeInOut' }}
          >
            <Footprints className="size-4" aria-hidden />L{cue.from} → L{cue.to}
          </motion.div>
        );
      }
      case 'died':
        return (
          <Flash
            at={seat(cue.player)}
            tone="blood"
            icon={<Skull className="size-6" aria-hidden />}
            text={t('fx.lost')}
            seconds={seconds}
          />
        );
      case 'revived':
        return (
          <Flash
            at={seat(cue.player)}
            tone="lock"
            icon={<HeartPulse className="size-6" aria-hidden />}
            text={`L${cue.layer}`}
            seconds={seconds}
          />
        );
      case 'lock':
        return (
          <Flash
            at={locate(layerSelectors(cue.layer))}
            tone="lock"
            icon={<Lock className="size-5" aria-hidden />}
            text={`${cue.from} → ${cue.to}`}
            seconds={seconds}
            rise
          />
        );
      case 'vault':
        return (
          <Flash
            at={locate(layerSelectors(cue.layer))}
            tone="acc"
            icon={<Vault className="size-6" aria-hidden />}
            text={t(`board.tower.vaultContent.${cue.content}`, { defaultValue: cue.content })}
            seconds={seconds}
          />
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在动作开始时量一次
  }, [playing.id]);

  return <>{content}</>;
}
