import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useService } from '@toeverything/infra';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export const Component = () => {
  const workbenchService = useService(WorkbenchService);
  const workspaceDialogService = useService(WorkspaceDialogService);
  const workbench = workbenchService.workbench;

  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? undefined;

  const isOpened = useRef(false);

  useEffect(() => {
    if (isOpened.current) {
      return;
    }
    isOpened.current = true; // prevent open multiple times
    workbench.openAll();
    workspaceDialogService.open('setting', {
      activeTab: tab as SettingTab,
    });
  }, [tab, workbench, workspaceDialogService]);
  return null;
};
