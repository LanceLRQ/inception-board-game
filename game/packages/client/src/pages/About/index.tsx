import { CopyrightNotice } from '../../components/CopyrightNotice';

export default function About() {
  return (
    <div className="min-h-dvh bg-background p-4 text-foreground">
      <h1 className="mb-4 text-2xl font-bold">关于</h1>
      <p className="text-dim">盗梦都市（Inception City Online）是一款爱好者复刻的在线多人桌游。</p>

      {/* 第 2 处版权展示：关于页完整声明 */}
      <CopyrightNotice variant="full" className="mt-6" />
    </div>
  );
}
