import { useService } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import type { View } from '../entities/view';
import { ViewService } from '../services/view';
import { WorkbenchService } from '../services/workbench';

export const useViewPosition = () => {
  const workbench = useService(WorkbenchService).workbench;
  const view = useService(ViewService).view;

  const [position, setPosition] = useState(() =>
    calcPosition(view, workbench.views$.value)
  );

  useEffect(() => {
    const subscription = workbench.views$.subscribe(views => {
      setPosition(calcPosition(view, views));
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [view, workbench]);

  return position;
};

function calcPosition(view: View, viewList: View[]) {
  const index = viewList.indexOf(view);
  return {
    index: index,
    isFirst: index === 0,
    isLast: index === viewList.length - 1,
  };
}
