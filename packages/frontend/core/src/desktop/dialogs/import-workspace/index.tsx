import { toast } from '@affine/component';
import {
  type DialogComponentProps,
  type GLOBAL_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import { _addLocalWorkspace } from '@affine/core/modules/workspace-engine';
import { DebugLogger } from '@affine/debug';
import { apis } from '@affine/electron-api';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import { useService, WorkspacesService } from '@toeverything/infra';
import { useLayoutEffect } from 'react';

const logger = new DebugLogger('ImportWorkspaceDialog');

export const ImportWorkspaceDialog = ({
  close,
}: DialogComponentProps<GLOBAL_DIALOG_SCHEMA['import-workspace']>) => {
  const t = useI18n();
  const workspacesService = useService(WorkspacesService);

  // TODO(@Peng): maybe refactor using xstate?
  useLayoutEffect(() => {
    let canceled = false;
    // a hack for now
    // when adding a workspace, we will immediately let user select a db file
    // after it is done, it will effectively add a new workspace to app-data folder
    // so after that, we will be able to load it via importLocalWorkspace
    (async () => {
      if (!apis) {
        return;
      }
      logger.info('load db file');
      const result = await apis.dialog.loadDBFile();
      if (result.workspaceId && !canceled) {
        _addLocalWorkspace(result.workspaceId);
        workspacesService.list.revalidate();
        close({
          workspace: {
            flavour: WorkspaceFlavour.LOCAL,
            id: result.workspaceId,
          },
        });
      } else if (result.error || result.canceled) {
        if (result.error) {
          toast(t[result.error]());
        }
        close();
      }
    })().catch(err => {
      console.error(err);
    });
    return () => {
      canceled = true;
    };
  }, [close, t, workspacesService]);

  return null;
};
