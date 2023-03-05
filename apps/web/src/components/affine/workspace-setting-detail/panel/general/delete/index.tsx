import { Button, Input, Modal, ModalCloseButton } from '@affine/component';
import { Trans, useTranslation } from '@affine/i18n';
import { useCallback, useState } from 'react';

import {
  AffineOfficialWorkspace,
  RemWorkspaceFlavour,
} from '../../../../../../shared';
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
  onDeleteWorkspace: () => void;
}

export const WorkspaceDeleteModal = ({
  open,
  onClose,
  workspace,
  onDeleteWorkspace,
}: WorkspaceDeleteProps) => {
  const [deleteStr, setDeleteStr] = useState<string>('');
  const allowDelete = deleteStr.toLowerCase() === 'delete';
  const { t } = useTranslation();

  const handleDelete = useCallback(() => {
    onDeleteWorkspace();
  }, [onDeleteWorkspace]);

  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} />
        <StyledModalHeader>{t('Delete Workspace')}?</StyledModalHeader>
        {workspace.flavour === RemWorkspaceFlavour.LOCAL ? (
          <StyledTextContent>
            <Trans i18nKey="Delete Workspace Description">
              Deleting (
              <StyledWorkspaceName>
                {{ workspace: workspace.blockSuiteWorkspace.meta.name } as any}
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
                {{ workspace: workspace.blockSuiteWorkspace.meta.name } as any}
              </StyledWorkspaceName>
              ) will delete both local and cloud data, this operation cannot be
              undone, please proceed with caution.
            </Trans>
          </StyledTextContent>
        )}
        <StyledInputContent>
          <Input
            onChange={setDeleteStr}
            data-testid="delete-workspace-input"
            placeholder={t('Delete Workspace placeholder')}
            value={deleteStr}
            width={284}
            height={42}
          ></Input>
        </StyledInputContent>
        <StyledButtonContent>
          <Button shape="circle" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            data-testid="delete-workspace-confirm-button"
            disabled={!allowDelete}
            onClick={handleDelete}
            type="danger"
            shape="circle"
            style={{ marginLeft: '24px' }}
          >
            {t('Delete')}
          </Button>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};
