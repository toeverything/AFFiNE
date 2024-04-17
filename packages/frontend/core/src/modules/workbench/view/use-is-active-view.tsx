import { useLiveData, useService } from '@toeverything/infra';

import { ViewService } from '../services/view';
import { WorkbenchService } from '../services/workbench';

export function useIsActiveView() {
  const workbench = useService(WorkbenchService).workbench;
  const view = useService(ViewService).view;

  const activeView = useLiveData(workbench.activeView$);
  return view === activeView;
}
