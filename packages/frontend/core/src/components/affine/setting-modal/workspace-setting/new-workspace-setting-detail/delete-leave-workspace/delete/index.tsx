import { Input } from '@affine/component';
import {
  ConfirmModal,
  type ConfirmModalProps,
} from '@affine/component/ui/modal';
import { useWorkspaceInfo } from '@affine/core/hooks/use-workspace-info';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { WorkspaceMetadata } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import * as styles from './style.css';

interface WorkspaceDeleteProps extends ConfirmModalProps {
  workspaceMetadata: WorkspaceMetadata;
}

export const WorkspaceDeleteModal = ({
  workspaceMetadata,
  ...props
}: WorkspaceDeleteProps) => {
  const { onConfirm } = props;
  const [deleteStr, setDeleteStr] = useState<string>('');
  const info = useWorkspaceInfo(workspaceMetadata);
  const workspaceName = info?.name ?? UNTITLED_WORKSPACE_NAME;
  const allowDelete = deleteStr === workspaceName;
  const t = useAFFiNEI18N();

  const handleOnEnter = useCallback(() => {
    if (allowDelete) {
      return onConfirm?.();
    }
  }, [allowDelete, onConfirm]);

  return (
    <ConfirmModal
      title={`${t['com.affine.workspaceDelete.title']()}?`}
      cancelText={t['com.affine.workspaceDelete.button.cancel']()}
      confirmButtonOptions={{
        type: 'error',
        disabled: !allowDelete,
        ['data-testid' as string]: 'delete-workspace-confirm-button',
        children: t['com.affine.workspaceDelete.button.delete'](),
      }}
      {...props}
    >
      {workspaceMetadata.flavour === WorkspaceFlavour.LOCAL ? (
        <Trans i18nKey="com.affine.workspaceDelete.description">
          Deleting (
          <span className={styles.workspaceName}>
            {{ workspace: workspaceName } as any}
          </span>
          ) cannot be undone, please proceed with caution. All contents will be
          lost.
        </Trans>
      ) : (
        <Trans i18nKey="com.affine.workspaceDelete.description2">
          Deleting (
          <span className={styles.workspaceName}>
            {{ workspace: workspaceName } as any}
          </span>
          ) will delete both local and cloud data, this operation cannot be
          undone, please proceed with caution.
        </Trans>
      )}
      <div className={styles.inputContent}>
        <Input
          autoFocus
          onChange={setDeleteStr}
          data-testid="delete-workspace-input"
          onEnter={handleOnEnter}
          placeholder={t['com.affine.workspaceDelete.placeholder']()}
          size="large"
        />
      </div>
    </ConfirmModal>
  );
};
