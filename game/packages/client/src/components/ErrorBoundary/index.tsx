// ErrorBoundary - 全局错误边界与回退界面
//
// 两条入口共用同一个 ErrorFallback：
//   - ErrorBoundary：类组件（错误边界只能用类组件），包在应用最外层，兜住路由之外的渲染错误
//   - RouteErrorFallback：挂在路由的 errorElement 上，处理路由内的渲染错误与 404

import { Component, useEffect, type ErrorInfo as ReactErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import { logger } from '../../lib/logger';
import { Button } from '../ui/button';

export interface ErrorDisplayInfo {
  readonly name: string;
  readonly message: string;
}

/** 把任意抛出的值整理成可展示的名称 + 说明 */
export function describeError(err: unknown): ErrorDisplayInfo {
  if (err instanceof Error) return { name: err.name, message: err.message };
  if (typeof err === 'string') return { name: 'Error', message: err };
  if (isRouteErrorResponse(err)) {
    const detail = err.statusText || (typeof err.data === 'string' ? err.data : '');
    return { name: `HTTP ${err.status}`, message: detail };
  }
  if (err === null || err === undefined) return { name: 'UnknownError', message: '未知错误' };
  try {
    return { name: 'UnknownError', message: JSON.stringify(err) ?? String(err) };
  } catch {
    return { name: 'UnknownError', message: String(err) };
  }
}

/** 路由匹配不到页面（404） */
export function isNotFoundError(err: unknown): boolean {
  return isRouteErrorResponse(err) && err.status === 404;
}

export interface ErrorFallbackProps {
  readonly error: unknown;
  /** 页面不存在：只显示「返回首页」 */
  readonly notFound?: boolean;
  /** 是否显示错误细节；缺省仅开发模式显示 */
  readonly showDetail?: boolean;
}

export function ErrorFallback({
  error,
  notFound = false,
  showDetail = import.meta.env.DEV,
}: ErrorFallbackProps) {
  const { t } = useTranslation();
  const info = describeError(error);

  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground"
      data-testid="error-fallback"
    >
      <TriangleAlert className="h-10 w-10 text-destructive" aria-hidden />
      <h1 className="text-xl font-bold">
        {notFound
          ? t('error.not_found', { defaultValue: '页面不存在' })
          : t('error.title', { defaultValue: '页面出了点问题' })}
      </h1>
      {!notFound && (
        <p className="max-w-md text-sm text-muted-foreground">
          {t('error.description', {
            defaultValue: '发生了意料之外的错误。可以重新加载页面，或回到首页再试一次。',
          })}
        </p>
      )}
      {showDetail && !notFound && (
        <pre
          className="max-w-full overflow-x-auto rounded-lg border border-border bg-card p-3 text-left text-xs text-dim"
          data-testid="error-fallback-detail"
        >
          {info.name}: {info.message}
        </pre>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {!notFound && (
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            {t('error.reload', { defaultValue: '重新加载' })}
          </Button>
        )}
        <Button type="button" onClick={() => window.location.assign('/')}>
          {t('error.home', { defaultValue: '返回首页' })}
        </Button>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  readonly children?: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: unknown, info: ReactErrorInfo): void {
    logger.error('app', 'render error', {
      ...describeError(error),
      componentStack: info.componentStack,
    });
  }

  override render(): ReactNode {
    if (this.state.hasError) return <ErrorFallback error={this.state.error} />;
    return this.props.children;
  }
}

/** 路由 errorElement：取出路由错误后复用 ErrorFallback */
export function RouteErrorFallback() {
  const error = useRouteError();
  const notFound = isNotFoundError(error);

  useEffect(() => {
    if (notFound) logger.warn('app', 'route not found', describeError(error));
    else logger.error('app', 'render error', describeError(error));
  }, [error, notFound]);

  return <ErrorFallback error={error} notFound={notFound} />;
}
