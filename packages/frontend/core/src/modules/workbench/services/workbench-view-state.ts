import { appInfo, type TabViewsMetaSchema } from '@affine/electron-api';
import type { GlobalStateService } from '@toeverything/infra';
import { createIdentifier, Service } from '@toeverything/infra';
import { nanoid } from 'nanoid';

import type { ViewIconName } from '../constants';

export type WorkbenchDefaultState = {
  basename: string;
  views: {
    id: string;
    path?: { pathname?: string; hash?: string; search?: string };
    icon?: ViewIconName;
    title?: string;
  }[];
  activeViewIndex: number;
};

export const WorkbenchDefaultState = createIdentifier<WorkbenchDefaultState>(
  'WorkbenchDefaultState'
);

export const InMemoryWorkbenchDefaultState: WorkbenchDefaultState = {
  basename: '/',
  views: [
    {
      id: nanoid(),
    },
  ],
  activeViewIndex: 0,
};

export class DesktopWorkbenchDefaultState
  extends Service
  implements WorkbenchDefaultState
{
  constructor(private readonly globalStateService: GlobalStateService) {
    super();
  }

  get value() {
    const tabViewsMeta =
      this.globalStateService.globalState.get<TabViewsMetaSchema>(
        'tabViewsMetaSchema'
      );

    return (
      tabViewsMeta?.workbenches.find(w => w.id === appInfo?.viewId) ||
      InMemoryWorkbenchDefaultState
    );
  }

  get basename() {
    return this.value.basename;
  }

  get activeViewIndex() {
    return this.value.activeViewIndex;
  }

  get views() {
    return this.value.views;
  }
}
