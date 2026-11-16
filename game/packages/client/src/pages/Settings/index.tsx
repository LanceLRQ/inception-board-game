import { useTranslation } from 'react-i18next';
import { ThemePicker } from '../../components/ThemePicker';
import { EffectSettings } from '../../components/EffectSettings';
import { CopyrightNotice } from '../../components/CopyrightNotice';
import { AudioControls } from '../../components/AudioControls';
import { SitePage } from '../../components/SitePage';
import { AccountSection } from './AccountSection';
import { AchievementsSection } from './AchievementsSection';
import { SettingsGroup } from './SettingsGroup';

export default function Settings() {
  const { t } = useTranslation();
  return (
    <SitePage title={t('settings.title')}>
      <SettingsGroup title={t('settings.sound')}>
        <AudioControls className="max-w-md" />
      </SettingsGroup>
      <SettingsGroup title={t('settings.appearance')}>
        <div className="max-w-xl space-y-3">
          <h3 className="text-sm font-semibold">{t('settings.theme')}</h3>
          <ThemePicker compact />
          <EffectSettings className="mt-5 border-t border-line pt-4" />
        </div>
      </SettingsGroup>
      <AccountSection />
      <AchievementsSection />

      {/* 第 4 处版权展示：设置页底部（替代结算页占位，兼做结算页外的长驻入口） */}
      <CopyrightNotice variant="footer" className="mt-6 border-t border-line pt-5" />
    </SitePage>
  );
}
