import { Button, Input, Modal, ModalCloseButton } from '@affine/component';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useCallback, useState } from 'react';

import type { AffineOfficialWorkspace } from '../../../../../shared';
import { toast } from '../../../../../utils';
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
  onDeleteWorkspace: (id: string) => Promise<void>;
}

export const WorkspaceDeleteModal = ({
  open,
  onClose,
  workspace,
  onDeleteWorkspace,
}: WorkspaceDeleteProps) => {
  const [workspaceName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace ?? null
  );
  const [deleteStr, setDeleteStr] = useState<string>('');
  const allowDelete = deleteStr === workspaceName;
  const t = useAFFiNEI18N();

  const handleDelete = useCallback(() => {
    onDeleteWorkspace(workspace.id)
      .then(() => {
        toast(t['Successfully deleted'](), {
          portal: document.body,
        });
        onClose();
      })
      .catch(() => {
        // ignore error
      });
  }, [onClose, onDeleteWorkspace, t, workspace.id]);

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
                setTimeout(() => ref.focus(), 0);
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
          <Button shape="circle" onClick={onClose}>
            {t['Cancel']()}
          </Button>
          <Button
            data-testid="delete-workspace-confirm-button"
            disabled={!allowDelete}
            onClick={handleDelete}
            type="danger"
            shape="circle"
            style={{ marginLeft: '24px' }}
          >
            {t['Delete']()}
          </Button>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};
