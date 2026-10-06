import { useTranslation } from 'react-i18next';
import { ThemePicker } from '../../components/ThemePicker';
import { CopyrightNotice } from '../../components/CopyrightNotice';
import { AudioControls } from '../../components/AudioControls';
import { AccountSection } from './AccountSection';

export default function Settings() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background p-4 text-foreground">
      <h1 className="mb-6 text-2xl font-bold">{t('settings.title')}</h1>

      <AccountSection />

      <section className="mb-6 rounded-xl bg-card p-4 shadow-sm ring-1 ring-border">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          {t('settings.appearance')}
        </h2>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t('settings.theme')}</span>
          <ThemePicker />
        </div>
      </section>

      <section className="mb-6 rounded-xl bg-card p-4 shadow-sm ring-1 ring-border">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t('settings.sound')}</h2>
        <AudioControls />
      </section>

      {/* 第 4 处版权展示：设置页底部（替代结算页占位，兼做结算页外的长驻入口） */}
      <CopyrightNotice variant="footer" className="mt-8" />
    </div>
  );
}
