import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageActionHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  stickyOnMobile?: boolean;
}

export function PageActionHeader({
  title,
  subtitle,
  actions,
  children,
  className,
  contentClassName,
  stickyOnMobile = true,
}: PageActionHeaderProps) {
  return (
    <div
      data-page-sticky-header
      className={cn(
        '-mx-4 -mt-4 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:-mx-6 lg:-mt-6 lg:px-6',
        stickyOnMobile ? 'sticky top-14 z-20 sm:top-16' : 'relative z-10 sm:sticky sm:top-16 sm:z-20',
        className
      )}
    >
      <div className="animate-fade-in-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      {children ? <div className={cn('mt-5', contentClassName)}>{children}</div> : null}
    </div>
  );
}
