import { useService } from '@toeverything/infra';
import { useEffect, useMemo } from 'react';

import { RightSidebar } from '../entities/right-sidebar';
import { RightSidebarView } from '../entities/right-sidebar-view';

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
  const rightSidebar = useService(RightSidebar);

  const view = useMemo(() => new RightSidebarView(), []);

  useEffect(() => {
    rightSidebar._append(view);
    return () => {
      rightSidebar._remove(view);
    };
  }, [rightSidebar, view]);

  useEffect(() => {
    if (active) {
      rightSidebar._moveToFront(view);
    }
  }, [active, rightSidebar, view]);

  return (
    <>
      <view.header.Provider>{header}</view.header.Provider>
      <view.body.Provider>{body}</view.body.Provider>
    </>
  );
};
