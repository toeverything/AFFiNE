import { Input } from '@affine/component';
import type { AffineOfficialWorkspace } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ConfirmModal,
  type ConfirmModalProps,
} from '@toeverything/components/modal';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useState } from 'react';

import { StyledInputContent, StyledWorkspaceName } from './style';

interface WorkspaceDeleteProps extends ConfirmModalProps {
  workspace: AffineOfficialWorkspace;
}

export const WorkspaceDeleteModal = ({
  workspace,
  ...props
}: WorkspaceDeleteProps) => {
  const [workspaceName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace
  );
  const [deleteStr, setDeleteStr] = useState<string>('');
  const allowDelete = deleteStr === workspaceName;
  const t = useAFFiNEI18N();

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
      {workspace.flavour === WorkspaceFlavour.LOCAL ? (
        <Trans i18nKey="com.affine.workspaceDelete.description">
          Deleting (
          <StyledWorkspaceName>
            {{ workspace: workspaceName } as any}
          </StyledWorkspaceName>
          ) cannot be undone, please proceed with caution. All contents will be
          lost.
        </Trans>
      ) : (
        <Trans i18nKey="com.affine.workspaceDelete.description2">
          Deleting (
          <StyledWorkspaceName>
            {{ workspace: workspaceName } as any}
          </StyledWorkspaceName>
          ) will delete both local and cloud data, this operation cannot be
          undone, please proceed with caution.
        </Trans>
      )}
      <StyledInputContent>
        <Input
          ref={ref => {
            if (ref) {
              window.setTimeout(() => ref.focus(), 0);
            }
          }}
          onChange={setDeleteStr}
          data-testid="delete-workspace-input"
          placeholder={t['com.affine.workspaceDelete.placeholder']()}
          width={315}
          height={42}
        />
      </StyledInputContent>
    </ConfirmModal>
  );
};
