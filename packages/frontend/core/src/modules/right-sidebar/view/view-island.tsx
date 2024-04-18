import { useService } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import type { RightSidebarView } from '../entities/right-sidebar-view';
import { RightSidebarService } from '../services/right-sidebar';

export interface RightSidebarViewProps {
  body: JSX.Element;
  header?: JSX.Element | null;
  name?: string;
  active?: boolean;
}

export const RightSidebarViewIsland = ({
  body,
  header,
  active,
}: RightSidebarViewProps) => {
  const rightSidebar = useService(RightSidebarService).rightSidebar;

  const [view, setView] = useState<RightSidebarView | null>(null);

  useEffect(() => {
    const view = rightSidebar._append();
    setView(view);
    return () => {
      rightSidebar._remove(view);
      setView(null);
    };
  }, [rightSidebar]);

  useEffect(() => {
    if (active && view) {
      rightSidebar._moveToFront(view);
    }
  }, [active, rightSidebar, view]);

  if (!view) {
    return null;
  }

  return (
    <>
      <view.header.Provider>{header}</view.header.Provider>
      <view.body.Provider>{body}</view.body.Provider>
    </>
  );
};
