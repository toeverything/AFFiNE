import { Input, Modal, ModalCloseButton } from '@affine/component';
import type { AffineOfficialWorkspace } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useState } from 'react';

import {
  StyledButtonContent,
  StyledInputContent,
  StyledModalHeader,
  StyledModalWrapper,
  StyledTextContent,
  StyledWorkspaceName,
} from './style';

interface WorkspaceDeleteProps {
  open: boolean;
  onClose: () => void;
  workspace: AffineOfficialWorkspace;
  onConfirm: () => void;
}

export const WorkspaceDeleteModal = ({
  open,
  onClose,
  onConfirm,
  workspace,
}: WorkspaceDeleteProps) => {
  const [workspaceName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace
  );
  const [deleteStr, setDeleteStr] = useState<string>('');
  const allowDelete = deleteStr === workspaceName;
  const t = useAFFiNEI18N();

  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} />
        <StyledModalHeader>{t['Delete Workspace']()}?</StyledModalHeader>
        {workspace.flavour === WorkspaceFlavour.LOCAL ? (
          <StyledTextContent>
            <Trans i18nKey="Delete Workspace Description">
              Deleting (
              <StyledWorkspaceName>
                {{ workspace: workspaceName } as any}
              </StyledWorkspaceName>
              ) cannot be undone, please proceed with caution. All contents will
              be lost.
            </Trans>
          </StyledTextContent>
        ) : (
          <StyledTextContent>
            <Trans i18nKey="Delete Workspace Description2">
              Deleting (
              <StyledWorkspaceName>
                {{ workspace: workspaceName } as any}
              </StyledWorkspaceName>
              ) will delete both local and cloud data, this operation cannot be
              undone, please proceed with caution.
            </Trans>
          </StyledTextContent>
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
            placeholder={t['Placeholder of delete workspace']()}
            width={315}
            height={42}
          />
        </StyledInputContent>
        <StyledButtonContent>
          <Button onClick={onClose} size="large">
            {t['Cancel']()}
          </Button>
          <Button
            data-testid="delete-workspace-confirm-button"
            disabled={!allowDelete}
            onClick={onConfirm}
            size="large"
            type="error"
            style={{ marginLeft: '24px' }}
          >
            {t['Delete']()}
          </Button>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};
