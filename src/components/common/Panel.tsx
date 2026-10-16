import type { ReactNode } from 'react';

interface PanelProps {
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Panel({ title, actions, className = '', bodyClassName = '', children }: PanelProps) {
  return (
    <section className={`glass flex min-h-0 flex-col rounded-xl ${className}`}>
      {(title ?? actions) !== undefined && (
        <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-ink-dim uppercase">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
