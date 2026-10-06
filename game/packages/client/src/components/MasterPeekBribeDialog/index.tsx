// 梦境窥视派贿赂决策 Dialog（梦主端）
// 对照：docs/manual/04-action-cards.md §梦境窥视 解析
// "梦主先决定是否让该盗梦者抽取 1 张贿赂牌，然后该盗梦者再查看任意一层梦境的金库"
//
// 复用 MasterPeekBribeBanner/logic.ts 的纯函数 computeMasterPeekBribeState。
// 皇城梦主看得到池内每张的成败时，可以指定其中一张（docs/manual/06-dream-master.md 皇城）。

import { useState } from 'react';
import { Coins } from 'lucide-react';
import type { MatchView } from '@icgame/game-engine';
import {
  computeMasterPeekBribeState,
  peekBribeDecisionArgs,
  type PoolChoice,
} from '../MasterPeekBribeBanner/logic.js';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface MasterPeekBribeDialogProps {
  G: MatchView | null | undefined;
  viewerPlayerID: string;
  nicknameOf?: (playerID: string) => string;
  makeMove: (move: string, args: unknown[]) => Promise<unknown> | void;
}

const CHOICE_CLASS =
  'rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted coarse:min-h-11';

/** 皇城·重金：指定池里的一张；选中状态随弹窗内容挂载，换了一次窥视（key 变）即清零 */
function PoolPicker({
  choices,
  selected,
  onSelect,
}: {
  choices: PoolChoice[];
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="指定一张贿赂牌"
      data-testid="master-peek-bribe-pool"
    >
      <span className="text-[11px] text-muted-foreground">皇城·重金，指定一张：</span>
      <button
        type="button"
        aria-pressed={selected === null}
        onClick={() => onSelect(null)}
        className={CHOICE_CLASS}
        data-testid="master-peek-bribe-pool-random"
      >
        随机
      </button>
      {choices.map((c, i) => (
        <button
          key={c.index}
          type="button"
          aria-pressed={selected === c.index}
          onClick={() => onSelect(c.index)}
          className={CHOICE_CLASS}
          data-testid={`master-peek-bribe-pool-${c.index}`}
        >
          第 {i + 1} 张（{c.kind === 'deal' ? 'DEAL' : '碎裂'}）
        </button>
      ))}
    </div>
  );
}

export function MasterPeekBribeDialog({
  G,
  viewerPlayerID,
  nicknameOf,
  makeMove,
}: MasterPeekBribeDialogProps) {
  const { visible, peekerID, layer, inPoolCount, poolChoices } = computeMasterPeekBribeState(
    G,
    viewerPlayerID,
  );
  const [poolIndex, setPoolIndex] = useState<number | null>(null);

  const peekerName = peekerID ? (nicknameOf?.(peekerID) ?? peekerID) : '盗梦者';
  // 指定的牌已不在可选列表里（池变了）就当没指定
  const picked = poolChoices?.some((c) => c.index === poolIndex) ? poolIndex : null;

  return (
    <Dialog open={visible} blocking size="md" data-testid="master-peek-bribe-dialog">
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Coins className="h-4 w-4 text-acc-bright" aria-hidden />
            {peekerName} 窥视第 {layer ?? '?'} 层 —— 是否派发 1 张贿赂牌？
          </span>
        </DialogTitle>
        <DialogDescription>
          贿赂池还剩 {inPoolCount} 张可派；命中 DEAL 将使 {peekerName} 立即转为梦主阵营。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <p className="text-xs text-muted-foreground">
          规则：梦主决定是否让该盗梦者抽取 1 张贿赂牌，然后盗梦者查看所选层的金库。
        </p>
        {poolChoices && (
          <PoolPicker choices={poolChoices} selected={picked} onSelect={setPoolIndex} />
        )}
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={() => {
            setPoolIndex(null);
            void makeMove('masterPeekBribeDecision', peekBribeDecisionArgs(false, null));
          }}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted"
          data-testid="master-peek-bribe-skip"
        >
          跳过
        </button>
        <button
          type="button"
          onClick={() => {
            setPoolIndex(null);
            void makeMove('masterPeekBribeDecision', peekBribeDecisionArgs(true, picked));
          }}
          className="rounded-md border border-acc bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-acc-bright"
          data-testid="master-peek-bribe-deal"
        >
          派发贿赂
        </button>
      </DialogFooter>
    </Dialog>
  );
}
