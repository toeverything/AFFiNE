import type { HTMLAttributes, ReactNode } from 'react';

export interface EmptyLayoutProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  illustrationLight: string;
  illustrationDark?: string;
  illustrationWidth?: number | string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;

  /**
   * Absolute center the content, useful for full screen empty states (e.g. mobile page)
   */
  absoluteCenter?: boolean;
}

export type UniversalEmptyProps = Partial<EmptyLayoutProps>;
