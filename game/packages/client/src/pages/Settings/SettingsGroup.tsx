import { useId, type ReactNode } from 'react';

export function SettingsGroup({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      className="grid gap-3 border-t border-line py-5 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-6 sm:py-6"
    >
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}
