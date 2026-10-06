import { useState } from 'react';
import { CopyrightNotice, CopyrightModal } from '../../components/CopyrightNotice';
import { hasAcknowledgedCopyright } from '../../lib/copyright';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Landing() {
  // 首次渲染时一次性读取 localStorage（lazy init，避免 effect 中 setState）
  const [showModal, setShowModal] = useState<boolean>(() => !hasAcknowledgedCopyright());

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-background py-8 text-foreground">
      <div className="flex flex-1 flex-col items-center justify-center">
        <h1 className="mb-2 text-4xl font-bold">盗梦都市</h1>
        <p className="mb-8 text-dim">Inception City Online</p>
        <div className="flex gap-4">
          <a
            href="/local"
            className={cn(buttonVariants({ variant: 'default' }), 'h-auto px-6 py-3 font-bold')}
          >
            单机练习
          </a>
          <a
            href="/lobby"
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'h-auto border-line-strong px-6 py-3 font-bold',
            )}
          >
            多人房间
          </a>
        </div>
      </div>

      {/* 第 1 处版权展示：首屏底部常驻 */}
      <CopyrightNotice variant="footer" className="mt-6 px-4" />

      {/* 第 3 处版权展示：教学前首次弹窗（localStorage ack 记忆） */}
      <CopyrightModal open={showModal} onAcknowledge={() => setShowModal(false)} />
    </div>
  );
}
