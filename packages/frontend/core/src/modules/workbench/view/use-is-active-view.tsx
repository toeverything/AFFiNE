import { useService } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';

import { Workbench } from '../entities/workbench';
import { useView } from './use-view';

export function useIsActiveView() {
  const workbench = useService(Workbench);
  const currentView = useView();
  const activeView = useLiveData(workbench.activeView);
  return currentView === activeView;
}
