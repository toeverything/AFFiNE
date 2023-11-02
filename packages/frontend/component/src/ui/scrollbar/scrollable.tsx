import * as ScrollArea from '@radix-ui/react-scroll-area';
import clsx from 'clsx';
import { forwardRef, type RefAttributes } from 'react';

import * as styles from './index.css';

export const ScrollableRoot = forwardRef<
  HTMLDivElement,
  ScrollArea.ScrollAreaProps & RefAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <ScrollArea.Root
      {...props}
      ref={ref}
      className={clsx(className, styles.scrollableContainerRoot)}
    >
      {children}
    </ScrollArea.Root>
  );
});

ScrollableRoot.displayName = 'ScrollableRoot';

export const ScrollableViewport = forwardRef<
  HTMLDivElement,
  ScrollArea.ScrollAreaViewportProps & RefAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <ScrollArea.Viewport
      {...props}
      ref={ref}
      className={clsx(className, styles.scrollableViewport)}
    >
      {children}
    </ScrollArea.Viewport>
  );
});

ScrollableViewport.displayName = 'ScrollableViewport';

export const ScrollableScrollbar = forwardRef<
  HTMLDivElement,
  ScrollArea.ScrollAreaScrollbarProps & RefAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <ScrollArea.Scrollbar
      orientation="vertical"
      {...props}
      ref={ref}
      className={clsx(className, styles.scrollbar)}
    >
      <ScrollArea.Thumb className={styles.scrollbarThumb} />
      {children}
    </ScrollArea.Scrollbar>
  );
});

ScrollableScrollbar.displayName = 'ScrollableScrollbar';

export const Scrollable = {
  Root: ScrollableRoot,
  Viewport: ScrollableViewport,
  Scrollbar: ScrollableScrollbar,
};
