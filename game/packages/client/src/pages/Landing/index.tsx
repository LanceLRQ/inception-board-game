import { useState } from 'react';
import { CopyrightNotice, CopyrightModal } from '../../components/CopyrightNotice';
import { hasAcknowledgedCopyright } from '../../lib/copyright';

export default function Landing() {
  // 首次渲染时一次性读取 localStorage（lazy init，避免 effect 中 setState）
  const [showModal, setShowModal] = useState<boolean>(() => !hasAcknowledgedCopyright());

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-bg-primary py-8 text-white">
      <div className="flex flex-1 flex-col items-center justify-center">
        <h1 className="mb-2 text-4xl font-bold">盗梦都市</h1>
        <p className="mb-8 text-gray-400">Inception City Online</p>
        <div className="flex gap-4">
          <a
            href="/local"
            className="rounded-lg bg-accent px-6 py-3 font-bold text-white hover:bg-accent-hover"
          >
            单机练习
          </a>
          <a
            href="/lobby"
            className="rounded-lg border border-white/20 px-6 py-3 font-bold text-white hover:bg-white/10"
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
