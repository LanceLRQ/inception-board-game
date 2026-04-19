import { ThemeToggle } from '../../components/ThemeToggle';
import { CopyrightNotice } from '../../components/CopyrightNotice';
import { AudioControls } from '../../components/AudioControls';

export default function Settings() {
  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <h1 className="mb-6 text-2xl font-bold">设置</h1>

      <section className="mb-6 rounded-xl bg-card p-4 shadow-sm ring-1 ring-border">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">外观</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm">主题</span>
          <ThemeToggle />
        </div>
      </section>

      <section className="mb-6 rounded-xl bg-card p-4 shadow-sm ring-1 ring-border">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">音效</h2>
        <AudioControls />
      </section>

      {/* 第 4 处版权展示：设置页底部（替代结算页占位，兼做结算页外的长驻入口） */}
      <CopyrightNotice variant="footer" className="mt-8" />
    </div>
  );
}
