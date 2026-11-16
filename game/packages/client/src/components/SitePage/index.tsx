import type { ReactNode } from 'react';

export function SitePage({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[60rem] flex-1 px-4 pt-5 pb-10 sm:px-6 sm:pt-7">
      <div className="mb-5 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 sm:mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {actions}
      </div>
      {children}
    </div>
  );
}
