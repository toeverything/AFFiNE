import type { LiveData } from '../../../livedata';

export interface ViewMeta {
  id: string;
}

export interface WorkbenchStateProvider {
  views$: LiveData<ViewMeta[]>;
  activeViewIndex$: LiveData<number>;
}

export const WorkbenchStateProvider = createIdentifier<WorkbenchStateProvider>(
  'WorkbenchStateProvider'
);
