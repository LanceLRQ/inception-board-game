import { createBrowserRouter } from 'react-router';
import { lazy, Suspense } from 'react';
import App from './App';
import { SiteLayout } from './components/SiteLayout';
import { RouteErrorFallback } from './components/ErrorBoundary';

import Invite from './pages/Invite';

const Landing = lazy(() => import('./pages/Landing'));
const Lobby = lazy(() => import('./pages/Lobby'));
const Room = lazy(() => import('./pages/Room'));
const Game = lazy(() => import('./pages/Game'));
const LocalMatch = lazy(() => import('./pages/LocalMatch'));
const Replay = lazy(() => import('./pages/Replay'));
const PlayerProfile = lazy(() => import('./pages/PlayerProfile'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));
const Tutorial = lazy(() => import('./pages/Tutorial'));

function PageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background text-dim">
      加载中...
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <App />,
    // 路由内的渲染错误与 404 都落到这里
    errorElement: <RouteErrorFallback />,
    children: [
      {
        path: '/',
        element: (
          <SiteLayout>
            <Suspense fallback={<PageLoader />}>
              <Landing />
            </Suspense>
          </SiteLayout>
        ),
      },
      {
        path: '/lobby',
        element: (
          <SiteLayout>
            <Suspense fallback={<PageLoader />}>
              <Lobby />
            </Suspense>
          </SiteLayout>
        ),
      },
      {
        path: '/room/:code',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Room />
          </Suspense>
        ),
      },
      {
        path: '/invite/:code',
        element: <Invite />,
      },
      {
        path: '/game/:matchId',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Game />
          </Suspense>
        ),
      },
      {
        path: '/local',
        element: (
          <Suspense fallback={<PageLoader />}>
            <LocalMatch />
          </Suspense>
        ),
      },
      {
        path: '/replay/:matchId',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Replay />
          </Suspense>
        ),
      },
      {
        path: '/players/:playerId',
        element: (
          <SiteLayout>
            <Suspense fallback={<PageLoader />}>
              <PlayerProfile />
            </Suspense>
          </SiteLayout>
        ),
      },
      {
        path: '/settings',
        element: (
          <SiteLayout>
            <Suspense fallback={<PageLoader />}>
              <Settings />
            </Suspense>
          </SiteLayout>
        ),
      },
      {
        path: '/about',
        element: (
          <SiteLayout>
            <Suspense fallback={<PageLoader />}>
              <About />
            </Suspense>
          </SiteLayout>
        ),
      },
      {
        path: '/tutorial',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Tutorial />
          </Suspense>
        ),
      },
    ],
  },
]);
