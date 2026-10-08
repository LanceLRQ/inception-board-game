// 梦主的金币金库三选一 Dialog
// 对照：docs/manual/03-game-flow.md 金库与梦魇牌（第 33-36、94-103 行）
// 状态与要发的 move 由 MasterNightmareDecisionBanner/logic.ts 推导，这里只负责展示与收集参数。

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { MatchView } from '@icgame/game-engine';
import {
  computeVaultDecisionCommand,
  computeVaultDecisionState,
  type VaultDecisionChoice,
  type VaultDecisionDraft,
  type VaultDecisionState,
} from '../MasterNightmareDecisionBanner/logic.js';
import { getCardName } from '../../lib/cards';
import { NightmareParamsForm } from '../NightmareParamsForm';
import { Dialog, DialogBody, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

export interface MasterNightmareDecisionDialogProps {
  G: MatchView | null | undefined;
  /** 观看者座位（来自对局来源，不得写死） */
  viewerPlayerID: string;
  nicknameOf?: (playerID: string) => string;
  makeMove: (move: string, args: unknown[]) => Promise<unknown> | void;
}

const EMPTY_DRAFT: VaultDecisionDraft = {
  poolIndex: null,
  echoLayer: null,
  echoAction: null,
  bribed: [],
};

const OPTION_CLASS =
  'rounded-md border border-border bg-background px-3 py-2 text-left text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 coarse:min-h-11';
const PRIMARY_CLASS =
  'rounded-md border border-acc bg-primary px-3 py-2 text-left text-xs font-medium text-primary-foreground hover:bg-acc-bright disabled:cursor-not-allowed disabled:opacity-50 coarse:min-h-11';

function reasonText(reason: 'poolEmpty' | 'noNightmare'): string {
  return reason === 'poolEmpty' ? '贿赂池已空，没有可派的牌' : '该层没有梦魇牌';
}

interface BodyProps {
  state: VaultDecisionState;
  openerName: string;
  nicknameOf: (playerID: string) => string;
  makeMove: MasterNightmareDecisionDialogProps['makeMove'];
}

/** 弹窗内容：挂载时草稿清零；换了一次决策（层或打开者变了）由外层的 key 重置 */
function VaultDecisionBody({ state, openerName, nicknameOf, makeMove }: BodyProps) {
  const [draft, setDraft] = useState<VaultDecisionDraft>(EMPTY_DRAFT);
  // 回音萦绕要先选层与方式、邪念瘟疫要先点名，展开后才出现确认按钮
  const [paramsOpen, setParamsOpen] = useState(false);

  const send = (choice: VaultDecisionChoice) => {
    const cmd = computeVaultDecisionCommand(state, choice, draft);
    if (cmd) void makeMove(cmd.move, cmd.args);
  };

  const nightmareName = state.nightmareId ? getCardName(state.nightmareId) : null;
  const discardLabel = state.hasNightmare ? '弃掉梦魇（不发动）' : '不派发';

  return (
    <div className="space-y-3">
      {nightmareName && (
        <p className="text-xs text-muted-foreground" data-testid="vault-decision-nightmare">
          该层梦魇：{nightmareName}
        </p>
      )}

      <div className="space-y-1.5">
        <button
          type="button"
          disabled={!state.bribe.enabled}
          onClick={() => send('bribe')}
          className={PRIMARY_CLASS}
          data-testid="vault-decision-bribe"
        >
          派发贿赂牌{state.hasNightmare ? '（并弃掉梦魇）' : ''}
          {draft.poolIndex === null ? '' : '：指定的一张'}
        </button>
        {state.bribe.reason && (
          <p className="text-[11px] text-muted-foreground">{reasonText(state.bribe.reason)}</p>
        )}
        {state.bribe.enabled && (
          <p className="text-[11px] text-muted-foreground">
            贿赂池还剩 {state.poolCount} 张可派；命中 DEAL 将使 {openerName} 转为梦主阵营。
          </p>
        )}
        {state.bribe.enabled && state.poolChoices && (
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="指定一张贿赂牌"
            data-testid="vault-decision-pool"
          >
            <span className="text-[11px] text-muted-foreground">皇城·重金，指定一张：</span>
            <button
              type="button"
              aria-pressed={draft.poolIndex === null}
              onClick={() => setDraft({ ...draft, poolIndex: null })}
              className={OPTION_CLASS}
              data-testid="vault-decision-pool-random"
            >
              随机
            </button>
            {state.poolChoices.map((c, i) => (
              <button
                key={c.index}
                type="button"
                aria-pressed={draft.poolIndex === c.index}
                onClick={() => setDraft({ ...draft, poolIndex: c.index })}
                className={OPTION_CLASS}
                data-testid={`vault-decision-pool-${c.index}`}
              >
                第 {i + 1} 张（{c.kind === 'deal' ? 'DEAL' : '碎裂'}）
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          disabled={!state.nightmare.enabled}
          onClick={() =>
            state.nightmareParams !== 'none' ? setParamsOpen(true) : send('nightmare')
          }
          className={OPTION_CLASS}
          data-testid="vault-decision-nightmare-activate"
        >
          发动梦魇{nightmareName ? `：${nightmareName}` : ''}
        </button>
        {state.nightmare.reason && (
          <p className="text-[11px] text-muted-foreground">{reasonText(state.nightmare.reason)}</p>
        )}
        {paramsOpen && state.nightmareParams !== 'none' && (
          <div
            className="space-y-1.5 rounded bg-background/60 p-2"
            data-testid="vault-decision-params"
          >
            <NightmareParamsForm
              kind={state.nightmareParams}
              draft={draft}
              onChange={(next) => setDraft({ ...draft, ...next })}
              candidates={state.plagueCandidates}
              poolCount={state.poolCount}
              nicknameOf={nicknameOf}
              testIdPrefix="vault-decision"
            />
            <button
              type="button"
              disabled={computeVaultDecisionCommand(state, 'nightmare', draft) === null}
              onClick={() => send('nightmare')}
              className={PRIMARY_CLASS}
              data-testid="vault-decision-params-confirm"
            >
              确认发动
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => send('discard')}
        className={OPTION_CLASS}
        data-testid="vault-decision-discard"
      >
        {discardLabel}
      </button>
    </div>
  );
}

export function MasterNightmareDecisionDialog({
  G,
  viewerPlayerID,
  nicknameOf,
  makeMove,
}: MasterNightmareDecisionDialogProps) {
  const state = computeVaultDecisionState(G, viewerPlayerID);
  const openerName = state.openerID ? (nicknameOf?.(state.openerID) ?? state.openerID) : '盗梦者';

  return (
    <Dialog open={state.visible} blocking size="md" data-testid="master-nightmare-decision-dialog">
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-acc-bright" aria-hidden />
            {openerName} 在第 {state.layer ?? '?'} 层打开了金币金库
          </span>
        </DialogTitle>
        <DialogDescription>请选择处理方式：派发贿赂牌、发动梦魇，或弃掉梦魇。</DialogDescription>
      </DialogHeader>
      <DialogBody>
        {state.visible && (
          <VaultDecisionBody
            key={`${state.layer}|${state.openerID}`}
            state={state}
            openerName={openerName}
            nicknameOf={nicknameOf ?? ((id) => id)}
            makeMove={makeMove}
          />
        )}
      </DialogBody>
    </Dialog>
  );
}
