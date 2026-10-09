import { ConfirmModal } from '@affine/component';
import { PureWorkspaceCard } from '@affine/core/components/workspace-selector/workspace-card';
import type {
  DialogComponentProps,
  GLOBAL_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import { WorkspacesService } from '@affine/core/modules/workspace';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import * as styles from './index.css';

export const BindMarkdownFolderDialog = ({
  filePath,
  folderPath,
  close,
}: DialogComponentProps<GLOBAL_DIALOG_SCHEMA['bind-markdown-folder']>) => {
  const workspaces = useLiveData(
    useService(WorkspacesService).list.workspaces$
  ).filter(workspace => workspace.flavour === 'local');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) close();
    },
    [close]
  );

  return (
    <ConfirmModal
      open
      width={480}
      title="Open Markdown file"
      description="Choose the workspace that should sync this folder."
      cancelText="Cancel"
      confirmText="Open"
      confirmButtonOptions={{ disabled: !workspaceId, variant: 'primary' }}
      onOpenChange={onOpenChange}
      onConfirm={() => workspaceId && close({ workspaceId })}
      childrenContentClassName={styles.content}
    >
      <div className={styles.path} title={filePath}>
        {folderPath}
      </div>
      <div className={styles.list}>
        {workspaces.length ? (
          workspaces.map(workspace => (
            <PureWorkspaceCard
              key={`${workspace.flavour}:${workspace.id}`}
              className={styles.workspace}
              workspaceMetadata={workspace}
              active={workspace.id === workspaceId}
              onClick={() => setWorkspaceId(workspace.id)}
            />
          ))
        ) : (
          <div className={styles.empty}>No workspace is available.</div>
        )}
      </div>
    </ConfirmModal>
  );
};
