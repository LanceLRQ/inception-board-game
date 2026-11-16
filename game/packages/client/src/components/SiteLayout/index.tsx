import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Menu, X } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useSiteReturnTo } from '../../hooks/useSiteReturnTo';
import { useIdentityStore } from '../../stores/useIdentityStore';
import { isOfflineIdentity } from '../../lib/identityApi';
import { Button } from '../ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet';

/** 只在非对局路由显式装配，避免改变房间的离开动作与游戏布局。 */
export function SiteLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const returnTo = useSiteReturnTo();
  const desktop = useMediaQuery('(min-width: 768px)');
  const playerId = useIdentityStore((s) => s.playerId);
  const token = useIdentityStore((s) => s.token);
  const auxiliary = pathname !== '/' && pathname !== '/lobby';
  const destinations = [
    { to: '/lobby', label: t('navigation.lobby') },
    { to: '/tutorial', label: t('navigation.tutorial') },
    { to: '/settings', label: t('settings.title') },
    { to: '/about', label: t('navigation.about') },
    ...(playerId && token && !isOfflineIdentity(token)
      ? [{ to: `/players/${encodeURIComponent(playerId)}`, label: t('profile.title') }]
      : []),
  ];
  const navigation = (
    <nav aria-label={t('navigation.label')}>
      <ul className="flex flex-col gap-1 md:flex-row md:items-center">
        {destinations.map(({ to, label }) => {
          const link = (
            <NavLink
              to={to}
              state={{ returnTo }}
              className="flex min-h-11 items-center rounded-md px-3 text-sm text-dim hover:bg-panel hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:underline aria-[current=page]:underline-offset-4"
            >
              {label}
            </NavLink>
          );
          return (
            <li key={to}>
              {desktop ? link : <SheetClose nativeButton={false} role="link" render={link} />}
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
        {auxiliary ? (
          <Link
            to={returnTo}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-2 text-sm text-dim hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {t(returnTo === '/' ? 'error.home' : 'match.back_to_lobby')}
          </Link>
        ) : (
          <Link
            to="/"
            className="inline-flex min-h-11 shrink-0 items-center rounded-md text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-current={pathname === '/' ? 'page' : undefined}
          >
            {t('landing.title')}
          </Link>
        )}
        {desktop ? (
          navigation
        ) : (
          <Sheet key={pathname}>
            <SheetTrigger render={<Button variant="ghost" className="min-h-11 px-3" />}>
              <Menu size={18} aria-hidden="true" />
              {t('navigation.menu')}
            </SheetTrigger>
            <SheetContent side="right" showCloseButton={false} className="p-4">
              <SheetHeader className="p-0 pr-12">
                <SheetTitle>{t('navigation.menuTitle')}</SheetTitle>
              </SheetHeader>
              <SheetClose
                render={
                  <Button variant="ghost" size="icon" className="absolute right-3 top-2 size-11" />
                }
                aria-label={t('common.close')}
              >
                <X size={18} aria-hidden="true" />
              </SheetClose>
              {navigation}
            </SheetContent>
          </Sheet>
        )}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
