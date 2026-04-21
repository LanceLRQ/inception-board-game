// 盗梦者金库查看 Dialog（peeker 端 · ack-only）
// 对照：docs/manual/04-action-cards.md §梦境窥视 效果①
// 复用 PeekerVaultRevealBanner/logic.ts

import { Eye, KeyRound, Coins, HelpCircle } from 'lucide-react';
import type { SetupState } from '@icgame/game-engine';
import { computePeekerVaultRevealState } from '../PeekerVaultRevealBanner/logic.js';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface PeekerVaultRevealDialogProps {
  G: SetupState | null | undefined;
  viewerPlayerID: string;
  makeMove: (move: string, args: unknown[]) => Promise<void> | void;
}

function vaultIcon(contentType: string) {
  if (contentType === 'secret') return <KeyRound className="h-4 w-4 text-red-500" />;
  if (contentType === 'coin') return <Coins className="h-4 w-4 text-amber-500" />;
  if (contentType === 'empty') return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}

function vaultLabel(contentType: string): string {
  if (contentType === 'secret') return '秘密（梦境核心）';
  if (contentType === 'coin') return '金币（普通金库）';
  if (contentType === 'empty') return '空（无内容）';
  if (contentType === 'hidden') return '未授权 — 请联系开发者（UI 故障）';
  return contentType;
}

export function PeekerVaultRevealDialog({
  G,
  viewerPlayerID,
  makeMove,
}: PeekerVaultRevealDialogProps) {
  const { visible, layer, vaults } = computePeekerVaultRevealState(G, viewerPlayerID);

  return (
    <Dialog open={visible} blocking size="md" data-testid="peeker-vault-reveal-dialog">
      <DialogHeader>
        <DialogTitle>
          <span className="inline-flex items-center gap-2">
            <Eye className="h-4 w-4 text-emerald-500" aria-hidden />第 {layer ?? '?'} 层金库内容
          </span>
        </DialogTitle>
        <DialogDescription>
          仅你可见 · 规则：不得公布你看到的结果（社交约束，引擎不强制）。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-1.5">
          {vaults.length === 0 ? (
            <div className="text-xs text-muted-foreground">该层无金库。</div>
          ) : (
            vaults.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 rounded bg-background/60 px-2 py-1.5"
              >
                {vaultIcon(v.contentType)}
                <span className="text-xs">
                  {vaultLabel(v.contentType)}
                  {v.isOpened && ' · 已开启'}
                </span>
              </div>
            ))
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={() => void makeMove('peekerAcknowledge', [])}
          className="rounded-md border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-600"
          data-testid="peeker-vault-reveal-ack"
        >
          已确认
        </button>
      </DialogFooter>
    </Dialog>
  );
}
