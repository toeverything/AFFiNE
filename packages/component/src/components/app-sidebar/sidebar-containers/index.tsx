import * as ScrollArea from '@radix-ui/react-scroll-area';
import clsx from 'clsx';
import { type PropsWithChildren, useEffect, useRef, useState } from 'react';

import * as styles from './index.css';

export function SidebarContainer({ children }: PropsWithChildren) {
  return <div className={clsx([styles.baseContainer])}>{children}</div>;
}

function useHasScrollTop() {
  const ref = useRef<HTMLDivElement>(null);
  const [hasScrollTop, setHasScrollTop] = useState(false);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const container = ref.current;

    function updateScrollTop() {
      if (container) {
        const hasScrollTop = container.scrollTop > 0;
        setHasScrollTop(hasScrollTop);
      }
    }

    container.addEventListener('scroll', updateScrollTop);
    updateScrollTop();
    return () => {
      container.removeEventListener('scroll', updateScrollTop);
    };
  }, []);

  return [hasScrollTop, ref] as const;
}

export function SidebarScrollableContainer({ children }: PropsWithChildren) {
  const [hasScrollTop, ref] = useHasScrollTop();
  return (
    <ScrollArea.Root className={styles.scrollableContainerRoot}>
      <div
        data-has-scroll-top={hasScrollTop}
        className={styles.scrollTopBorder}
      />
      <ScrollArea.Viewport
        className={clsx([styles.scrollableViewport])}
        ref={ref}
      >
        <div className={clsx([styles.scrollableContainer])}>{children}</div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        forceMount
        orientation="vertical"
        className={styles.scrollbar}
      >
        <ScrollArea.Thumb className={styles.scrollbarThumb} />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
