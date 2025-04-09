import {
  NavigationPanelTreeContext,
  type NodeOperation,
} from '@affine/core/desktop/components/navigation-panel';
import { useMemo, useState } from 'react';

import * as styles from './root.css';

export const NavigationPanelTreeRoot = ({
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
      <NavigationPanelTreeContext.Provider value={contextValue}>
        {children}
      </NavigationPanelTreeContext.Provider>
    </div>
  );
};
