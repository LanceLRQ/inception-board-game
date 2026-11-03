// 盗梦者金库查看 Dialog（peeker 端 · ack-only）
// 对照：docs/manual/04-action-cards.md §梦境窥视 效果①
// 复用 PeekerVaultRevealBanner/logic.ts

import { Eye } from 'lucide-react';
import type { MatchView } from '@icgame/game-engine';
import { getCardImageUrl } from '../../lib/cardImages';
import { CardArt } from '../CardArt';
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
  G: MatchView | null | undefined;
  viewerPlayerID: string;
  makeMove: (move: string, args: unknown[]) => Promise<unknown> | void;
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
            <Eye className="h-4 w-4 text-ok" aria-hidden />第 {layer ?? '?'} 层金库内容
          </span>
        </DialogTitle>
        <DialogDescription>
          仅你可见 · 规则：不得公布你看到的结果（社交约束，引擎不强制）。
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-wrap justify-center gap-4">
          {vaults.length === 0 ? (
            <div className="text-xs text-muted-foreground">该层无金库。</div>
          ) : (
            vaults.map((v) => (
              <figure key={v.id} className="flex flex-col items-center gap-2">
                {(v.contentType === 'secret' || v.contentType === 'coin') && (
                  <CardArt
                    src={getCardImageUrl(
                      v.contentType === 'secret' ? 'vault_secret' : 'vault_gold',
                    )}
                    alt={vaultLabel(v.contentType)}
                    trimBorder={false}
                    className="h-auto max-h-[min(42dvh,360px)] w-auto max-w-full rounded-md"
                  />
                )}
                <figcaption className="text-xs text-muted-foreground">
                  {vaultLabel(v.contentType)}
                  {v.isOpened && ' · 已开启'}
                </figcaption>
              </figure>
            ))
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <button
          type="button"
          onClick={() => void makeMove('peekerAcknowledge', [])}
          className="rounded-md border border-ok bg-ok px-3 py-1.5 text-xs font-medium text-background hover:bg-ok/90"
          data-testid="peeker-vault-reveal-ack"
        >
          已确认
        </button>
      </DialogFooter>
    </Dialog>
  );
}
