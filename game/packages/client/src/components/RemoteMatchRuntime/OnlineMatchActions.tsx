import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { api } from '../../lib/api';
import { forgetOnlineMatch } from '../../lib/onlineMatchMemo';
import { requestErrorMessage } from '../../lib/roomQueries';
import { logger } from '../../lib/logger';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

export function OnlineMatchActions({
  path,
  isOwner,
  onExit,
}: {
  path: string;
  isOwner: boolean;
  onExit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = isOwner ? '结束本局' : '退出本局';
  const confirm = () => {
    setPending(true);
    setError(null);
    void api.post(path).then(
      () => {
        logger.flow('room', isOwner ? 'ended match' : 'left match');
        forgetOnlineMatch();
        onExit();
      },
      (failure) => {
        setPending(false);
        setError(requestErrorMessage(failure));
      },
    );
  };
  return (
    <>
      <button
        type="button"
        className="flex min-h-11 items-center gap-1 px-2 text-xs text-dim hover:text-foreground"
        onClick={() => setOpen(true)}
        data-testid="online-match-exit"
      >
        <LogOut size={16} aria-hidden />
        {label}
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        blocking={pending}
        data-testid="online-match-exit-dialog"
      >
        <DialogHeader>
          <DialogTitle>{label}？</DialogTitle>
          <DialogDescription>
            {isOwner
              ? '所有玩家的对局将停止，保留历史记录，本局不判定胜负。'
              : '你的席位将由 Bot 接管，其他玩家继续游戏。退出后不能重新加入本局。'}
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <button
            type="button"
            className="tabletop-secondary"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            继续游戏
          </button>
          <button type="button" className="tabletop-primary" disabled={pending} onClick={confirm}>
            {pending ? '正在处理…' : label}
          </button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
