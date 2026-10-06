import { createBrowserRouter } from 'react-router';
import { lazy, Suspense } from 'react';
import App from './App';
import { RouteErrorFallback } from './components/ErrorBoundary';

const Landing = lazy(() => import('./pages/Landing'));
const Lobby = lazy(() => import('./pages/Lobby'));
const Room = lazy(() => import('./pages/Room'));
const Game = lazy(() => import('./pages/Game'));
const LocalMatch = lazy(() => import('./pages/LocalMatch'));
const Replay = lazy(() => import('./pages/Replay'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));
const Tutorial = lazy(() => import('./pages/Tutorial'));

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-dim">
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
          <Suspense fallback={<PageLoader />}>
            <Landing />
          </Suspense>
        ),
      },
      {
        path: '/lobby',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Lobby />
          </Suspense>
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
        path: '/settings',
        element: (
          <Suspense fallback={<PageLoader />}>
            <Settings />
          </Suspense>
        ),
      },
      {
        path: '/about',
        element: (
          <Suspense fallback={<PageLoader />}>
            <About />
          </Suspense>
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
