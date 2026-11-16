import { useQuery } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import { isOfflineIdentity } from '../../lib/identityApi';
import { useIdentityStore } from '../../stores/useIdentityStore';
import { SettingsGroup } from './SettingsGroup';

interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: string;
}

export function AchievementsSection() {
  const { t, i18n } = useTranslation();
  const playerId = useIdentityStore((state) => state.playerId);
  const token = useIdentityStore((state) => state.token);
  const enabled = Boolean(playerId && token && !isOfflineIdentity(token));
  const achievements = useQuery({
    queryKey: ['my-achievements', playerId],
    queryFn: ({ signal }) =>
      api.get<{ data: Achievement[] }>('/players/me/achievements', { signal, cache: 'no-store' }),
    enabled,
    staleTime: 0,
  });
  if (!enabled) return null;

  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });
  return (
    <SettingsGroup title={t('achievements.title')}>
      {achievements.isPending && (
        <p role="status" className="text-sm">
          {t('common.loading')}
        </p>
      )}
      {achievements.isError && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p role="alert">{t('achievements.loadFailed')}</p>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => void achievements.refetch()}
          >
            {t('common.retry')}
          </Button>
        </div>
      )}
      {achievements.data?.data.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('achievements.empty')}</p>
      )}
      {achievements.data && achievements.data.data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {achievements.data.data.map(({ id, name, description, unlockedAt }) => (
            <li
              key={id}
              className="flex min-w-0 items-start gap-3 rounded-lg border border-border p-3"
            >
              <Trophy className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 space-y-1 text-sm wrap-anywhere">
                <h3 className="font-semibold">
                  {t(`achievements.items.${id}.name`, { defaultValue: name })}
                </h3>
                <p className="text-muted-foreground">
                  {t(`achievements.items.${id}.description`, { defaultValue: description })}
                </p>
                <time dateTime={unlockedAt} className="block text-xs text-muted-foreground">
                  {date.format(new Date(unlockedAt))}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsGroup>
  );
}
