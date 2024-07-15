import { useMemo, useState } from 'react';

import { ExplorerTreeContext } from './context';
import * as styles from './root.css';
import type { NodeOperation } from './types';

export const ExplorerTreeRoot = ({
  children,
  childrenOperations = [],
  placeholder,
}: {
  children?: React.ReactNode;
  childrenOperations?: NodeOperation[];
  className?: string;
  placeholder?: React.ReactNode;
}) => {
  const [childCount, setChildCount] = useState(0);
  const contextValue = useMemo(() => {
    return {
      operations: childrenOperations,
      level: 0,
      registerChild: () => {
        setChildCount(c => c + 1);
        return () => setChildCount(c => c - 1);
      },
    };
  }, [childrenOperations]);

  return (
    // <div> is for placeholder:last-child selector
    <div>
      {/* For lastInGroup check, the placeholder must be placed above all children in the dom */}
      <div className={styles.placeholder}>
        {childCount === 0 && placeholder}
      </div>
      <ExplorerTreeContext.Provider value={contextValue}>
        {children}
      </ExplorerTreeContext.Provider>
    </div>
  );
};
