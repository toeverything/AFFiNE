import { type PropsWithChildren, type ReactNode, useState } from 'react';

import { SplitViewContext } from './split-view.context';
import type { SplitPanel } from './types';

export const SplitViewProvider = ({
  children,
  initPanels,
}: {
  initPanels: SplitPanel[];
} & PropsWithChildren) => {
  const [panels, setPanels] = useState<SplitPanel[]>(initPanels);
  const [dragging, setDragging] = useState(false);
  const [nodeToAppend, setNodeToAppend] = useState<ReactNode>(null);
  const [readyToDrop, setReadyToDrop] = useState(false);

  return (
    <SplitViewContext.Provider
      value={{
        panels,
        setPanels,
        dragging,
        setDragging,
        nodeToAppend,
        setNodeToAppend,
        readyToDrop,
        setReadyToDrop,
      }}
    >
      {children}
    </SplitViewContext.Provider>
  );
};
