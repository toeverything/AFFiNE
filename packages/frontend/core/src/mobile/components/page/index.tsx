import { type HTMLAttributes, type ReactNode, useEffect } from 'react';

import * as styles from './styles.css';

interface PageProps extends HTMLAttributes<HTMLDivElement> {
  tab?: boolean;
  header?: ReactNode;
}

/**
 * A Page is a full-screen container that will not scroll on document.
 */
export const Page = ({ children, tab = true, header, ...attrs }: PageProps) => {
  // disable scroll on body
  useEffect(() => {
    const prevOverflowY = document.body.style.overflowY;
    document.body.style.overflowY = 'hidden';
    return () => {
      document.body.style.overflowY = prevOverflowY;
    };
  }, []);

  return (
    <main className={styles.page} {...attrs} data-tab={tab}>
      {header}
      {children}
    </main>
  );
};
