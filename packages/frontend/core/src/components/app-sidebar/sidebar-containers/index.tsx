import { useHasScrollTop } from '@affine/component';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import clsx from 'clsx';
import { type PropsWithChildren } from 'react';

import * as styles from './index.css';

export function SidebarContainer({ children }: PropsWithChildren) {
  return <div className={clsx([styles.baseContainer])}>{children}</div>;
}

export function SidebarScrollableContainer({ children }: PropsWithChildren) {
  const [setContainer, hasScrollTop] = useHasScrollTop();
  return (
    <ScrollArea.Root className={styles.scrollableContainerRoot}>
      <div
        data-has-scroll-top={hasScrollTop}
        className={styles.scrollTopBorder}
      />
      <ScrollArea.Viewport
        className={clsx([styles.scrollableViewport])}
        ref={setContainer}
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
