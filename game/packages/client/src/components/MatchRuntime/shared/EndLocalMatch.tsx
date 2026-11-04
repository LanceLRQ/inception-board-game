import { useState } from 'react';
import { LogOut } from 'lucide-react';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';

export function EndLocalMatch({
  endMatch,
  onExit,
}: {
  endMatch: () => Promise<void>;
  onExit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const confirm = () => {
    setPending(true);
    setFailed(false);
    void endMatch().then(onExit, () => {
      setPending(false);
      setFailed(true);
    });
  };
  return (
    <>
      <button
        type="button"
        aria-label="结束本局"
        title="结束本局"
        data-testid="end-local-match"
        className="flex min-h-11 min-w-11 items-center justify-center text-dim hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <LogOut size={18} aria-hidden />
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        blocking={pending}
        data-testid="end-local-match-dialog"
      >
        <DialogHeader>
          <DialogTitle>结束本局？</DialogTitle>
          <DialogDescription>本局人机对战将停止，续玩存档会清除。</DialogDescription>
        </DialogHeader>
        {failed && <p role="alert">结束失败，请重试。</p>}
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
            {pending ? '正在结束…' : '结束本局'}
          </button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
