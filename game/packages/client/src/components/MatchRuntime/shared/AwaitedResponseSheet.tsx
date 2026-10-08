// 应答弹窗：需要选牌、分牌、选层的应答（狂热弃牌、天秤分牌 / 挑一份、处女复活 / 传送、白羊·回音萦绕、
// 黑洞·吞噬交牌、达尔文·淘汰放回牌库顶、雅典娜·急智选弃牌堆里的牌）。
// 窗口 / 响应条上的按钮打开它；选择只存在控制层的草稿里，确认后才发 move。样式钩子类名：ms-btn。

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { getCardName } from '../../../lib/cards';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import {
  DARWIN_RETURN_COUNT,
  ECHO_LAYERS,
  groupDiscard,
  splitPiles,
} from '../response/awaitedResponse';
import { NightmareParamsForm } from '../../NightmareParamsForm';
import type { MatchController } from '../controllerTypes';

interface ChoiceProps {
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testId: string;
  readonly children: ReactNode;
}

/** 单选 / 多选的一个选项 */
function Choice({ selected, onPress, testId, children }: ChoiceProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPress}
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px]',
        selected
          ? 'border-acc bg-acc/30 text-acc-bright'
          : 'border-border bg-card hover:border-acc/60',
      )}
    >
      {selected && <Check className="size-3" aria-hidden />}
      {children}
    </button>
  );
}

interface PileProps {
  readonly title: string;
  readonly cards: readonly string[];
  readonly emptyText: string;
  readonly testId: string;
}

function Pile({ title, cards, emptyText, testId }: PileProps) {
  return (
    <div className="rounded-md border border-line px-2.5 py-2" data-testid={testId}>
      <p className="mb-1 text-[11px] text-dim">{title}</p>
      {cards.length === 0 ? (
        <p className="text-[12px] text-faint">{emptyText}</p>
      ) : (
        <p className="text-[12px] leading-relaxed text-foreground">
          {cards.map((c) => getCardName(c)).join('、')}
        </p>
      )}
    </div>
  );
}

interface AwaitedResponseSheetProps {
  readonly controller: MatchController;
}

export function AwaitedResponseSheet({ controller }: AwaitedResponseSheetProps) {
  const { t } = useTranslation();
  const { awaited, sheet } = controller.response;
  const mode = awaited !== null ? sheet.open : null;
  const draft = sheet.draft;

  let title = '';
  let description = '';
  let body: ReactNode = null;
  let confirmLabel: string | null = null;

  if (awaited !== null && mode === 'zealot-discard' && awaited.kind === 'shoot-zealot') {
    title = t('awaited.sheet.zealotDiscard.title');
    description = t('awaited.sheet.zealotDiscard.desc');
    confirmLabel = t('awaited.sheet.zealotDiscard.confirm');
    body = (
      <div className="flex flex-wrap gap-2" data-testid="awaited-sheet-hand">
        {awaited.hand.map((card, i) => (
          <Choice
            key={`zealot-${i}-${card}`}
            selected={draft.discardIndex === i}
            onPress={() => sheet.pickDiscard(i)}
            testId={`awaited-card-${i}`}
          >
            {getCardName(card)}
          </Choice>
        ))}
      </div>
    );
  } else if (awaited !== null && mode === 'libra-split' && awaited.kind === 'libra-split') {
    const piles = splitPiles(awaited.hand, draft.secondPile);
    title = t('awaited.sheet.libraSplit.title');
    description = t('awaited.sheet.libraSplit.desc');
    confirmLabel = t('awaited.sheet.libraSplit.confirm');
    const second = new Set(draft.secondPile);
    body = (
      <>
        <div className="flex flex-wrap gap-2" data-testid="awaited-sheet-hand">
          {awaited.hand.map((card, i) => (
            <Choice
              key={`split-${i}-${card}`}
              selected={second.has(i)}
              onPress={() => sheet.toggleSecondPile(i)}
              testId={`awaited-card-${i}`}
            >
              {getCardName(card)}
            </Choice>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Pile
            title={t('awaited.sheet.libraSplit.pile', { n: 1, count: piles.pile1.length })}
            cards={piles.pile1}
            emptyText={t('awaited.sheet.libraSplit.empty')}
            testId="awaited-pile-1"
          />
          <Pile
            title={t('awaited.sheet.libraSplit.pile', { n: 2, count: piles.pile2.length })}
            cards={piles.pile2}
            emptyText={t('awaited.sheet.libraSplit.empty')}
            testId="awaited-pile-2"
          />
        </div>
      </>
    );
  } else if (awaited !== null && mode === 'libra-pick' && awaited.kind === 'libra-pick') {
    title = t('awaited.sheet.libraPick.title');
    description = t('awaited.sheet.libraPick.desc', {
      name: controller.nicknameOf(awaited.targetID),
    });
    body = (
      <div className="grid gap-2 sm:grid-cols-2">
        {([awaited.pile1, awaited.pile2] as const).map((cards, i) => (
          <div key={`pick-${i}`} className="flex flex-col gap-2">
            <Pile
              title={t('awaited.sheet.libraPick.pile', { n: i + 1, count: cards.length })}
              cards={cards}
              emptyText={t('awaited.sheet.libraPick.empty')}
              testId={`awaited-pile-${i + 1}`}
            />
            <button
              type="button"
              onClick={() => sheet.pickPile(i === 0 ? 'pile1' : 'pile2')}
              data-testid={`awaited-take-${i + 1}`}
              className="ms-btn min-h-8 px-3 text-[12px]"
              data-variant="primary"
            >
              {t('awaited.sheet.libraPick.take', { n: i + 1 })}
            </button>
          </div>
        ))}
      </div>
    );
  } else if (awaited !== null && mode === 'virgo-revive' && awaited.kind === 'virgo') {
    title = t('awaited.sheet.virgoRevive.title');
    description = t('awaited.sheet.virgoRevive.desc');
    confirmLabel = t('awaited.sheet.virgoRevive.confirm');
    body = (
      <div className="flex flex-wrap gap-2" data-testid="awaited-sheet-targets">
        {awaited.reviveTargets.map((id) => (
          <Choice
            key={`revive-${id}`}
            selected={draft.reviveTarget === id}
            onPress={() => sheet.pickReviveTarget(id)}
            testId={`awaited-revive-${id}`}
          >
            {controller.nicknameOf(id)}
          </Choice>
        ))}
      </div>
    );
  } else if (awaited !== null && mode === 'virgo-teleport' && awaited.kind === 'virgo') {
    title = t('awaited.sheet.virgoTeleport.title');
    description = t('awaited.sheet.virgoTeleport.desc');
    confirmLabel = t('awaited.sheet.virgoTeleport.confirm');
    body = (
      <div className="flex flex-wrap gap-2" data-testid="awaited-sheet-layers">
        {awaited.teleportLayers.map((layer) => (
          <Choice
            key={`teleport-${layer}`}
            selected={draft.teleportLayer === layer}
            onPress={() => sheet.pickTeleportLayer(layer)}
            testId={`awaited-layer-${layer}`}
          >
            {t('awaited.sheet.virgoTeleport.layer', { layer })}
          </Choice>
        ))}
      </div>
    );
  } else if (awaited !== null && mode === 'aries-echo' && awaited.kind === 'aries') {
    title = t('awaited.sheet.ariesEcho.title');
    description = t('awaited.sheet.ariesEcho.desc');
    confirmLabel = t('awaited.sheet.ariesEcho.confirm');
    body = (
      <>
        <div className="flex flex-wrap gap-2" data-testid="awaited-sheet-layers">
          {ECHO_LAYERS.map((layer) => (
            <Choice
              key={`echo-${layer}`}
              selected={draft.echoLayer === layer}
              onPress={() => sheet.pickEchoLayer(layer)}
              testId={`awaited-layer-${layer}`}
            >
              {t('awaited.sheet.ariesEcho.layer', { layer })}
            </Choice>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" data-testid="awaited-sheet-echo-action">
          {(['restore', 'add'] as const).map((action) => (
            <Choice
              key={`echo-action-${action}`}
              selected={draft.echoAction === action}
              onPress={() => sheet.pickEchoAction(action)}
              testId={`awaited-echo-${action}`}
            >
              {t(`awaited.sheet.ariesEcho.${action}`)}
            </Choice>
          ))}
        </div>
      </>
    );
  } else if (awaited !== null && mode === 'levy-give' && awaited.kind === 'levy') {
    title = t('awaited.sheet.levyGive.title');
    description = t('awaited.sheet.levyGive.desc', {
      name: controller.nicknameOf(awaited.blackHoleID),
    });
    confirmLabel = t('awaited.sheet.levyGive.confirm');
    body = (
      <div className="flex flex-wrap gap-2" data-testid="awaited-sheet-hand">
        {awaited.hand.map((card, i) => (
          <Choice
            key={`give-${i}-${card}`}
            selected={draft.giveIndex === i}
            onPress={() => sheet.pickGive(i)}
            testId={`awaited-card-${i}`}
          >
            {getCardName(card)}
          </Choice>
        ))}
      </div>
    );
  } else if (awaited !== null && mode === 'darwin-return' && awaited.kind === 'darwin') {
    title = t('awaited.sheet.darwinReturn.title');
    description = t('awaited.sheet.darwinReturn.desc');
    confirmLabel = t('awaited.sheet.darwinReturn.confirm');
    body = (
      <>
        <div className="flex flex-wrap gap-2" data-testid="awaited-sheet-hand">
          {awaited.hand.map((card, i) => {
            const order = draft.returnPicks.indexOf(i);
            return (
              <Choice
                key={`return-${i}-${card}`}
                selected={order >= 0}
                onPress={() => sheet.toggleReturn(i)}
                testId={`awaited-card-${i}`}
              >
                {order >= 0 && (
                  <span className="font-mono text-[11px]" data-testid={`awaited-order-${i}`}>
                    {order + 1}
                  </span>
                )}
                {getCardName(card)}
              </Choice>
            );
          })}
        </div>
        <p className="text-[12px] text-dim" data-testid="awaited-return-progress">
          {t('awaited.sheet.darwinReturn.progress', {
            count: draft.returnPicks.length,
            total: DARWIN_RETURN_COUNT,
          })}
        </p>
      </>
    );
  } else if (awaited !== null && mode === 'athena-pick' && awaited.kind === 'athena') {
    const groups = groupDiscard(awaited.discard);
    title = t('awaited.sheet.athenaPick.title');
    description = t('awaited.sheet.athenaPick.desc', {
      name: controller.nicknameOf(awaited.userID),
      card: getCardName(awaited.cardId),
    });
    confirmLabel = t('awaited.sheet.athenaPick.confirm');
    body = (
      <div
        className="flex max-h-64 flex-wrap gap-2 overflow-y-auto"
        data-testid="awaited-sheet-discard"
      >
        {groups.map(({ card, count }) => (
          <Choice
            key={`discard-${card}`}
            selected={draft.athenaCard === card}
            onPress={() => sheet.pickAthenaCard(card)}
            testId={`awaited-discard-${card}`}
          >
            {getCardName(card)}
            {count > 1 && <span className="font-mono text-[11px]">×{count}</span>}
          </Choice>
        ))}
      </div>
    );
  } else if (awaited !== null && mode === 'aries-plague' && awaited.kind === 'aries') {
    title = t('awaited.sheet.ariesPlague.title');
    description = t('awaited.sheet.ariesPlague.desc');
    confirmLabel = t('awaited.sheet.ariesPlague.confirm');
    body = (
      <NightmareParamsForm
        kind="plague"
        draft={draft}
        onChange={(next) => sheet.setNightmareDraft(next)}
        candidates={awaited.candidates}
        poolCount={awaited.bribePoolCount}
        nicknameOf={controller.nicknameOf}
        testIdPrefix="awaited-nm"
      />
    );
  }

  return (
    <Dialog
      open={body !== null}
      onOpenChange={(o) => {
        if (!o) sheet.close();
      }}
      blocking={false}
      size="md"
      data-testid="awaited-sheet"
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogBody>{body}</DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={sheet.close}
          data-testid="awaited-sheet-back"
          className="ms-btn min-h-8 px-3 text-[12px]"
        >
          {t('awaited.sheet.back')}
        </button>
        {confirmLabel !== null && (
          <button
            type="button"
            disabled={!sheet.canConfirm}
            onClick={sheet.confirm}
            data-testid="awaited-sheet-confirm"
            className="ms-btn min-h-8 px-3 text-[12px]"
            data-variant="primary"
          >
            {confirmLabel}
          </button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
