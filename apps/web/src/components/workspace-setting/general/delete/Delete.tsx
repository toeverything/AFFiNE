import { Modal } from '@affine/component';
import { Input } from '@affine/component';
import { ModalCloseButton } from '@affine/component';
import { Button } from '@affine/component';
import { WorkspaceUnit } from '@affine/datacenter';
import { Trans, useTranslation } from '@affine/i18n';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';

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
  workspace: WorkspaceUnit;
}

export const WorkspaceDelete = ({
  open,
  onClose,
  workspace,
}: WorkspaceDeleteProps) => {
  const [deleteStr, setDeleteStr] = useState<string>('');
  const { t } = useTranslation();
  const router = useRouter();
  const { deleteWorkSpace } = useWorkspaceHelper();
  const handlerInputChange = (workspaceName: string) => {
    setDeleteStr(workspaceName);
  };

  const handleDelete = async () => {
    await deleteWorkSpace();
    onClose();
    router.push(`/workspace`);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} />
        <StyledModalHeader>{t('Delete Workspace')}?</StyledModalHeader>
        {workspace.provider === 'local' ? (
          <StyledTextContent>
            <Trans i18nKey="Delete Workspace Description">
              Deleting (
              <StyledWorkspaceName>{workspace.name}</StyledWorkspaceName>)
              cannot be undone, please proceed with caution. along with all its
              content.
            </Trans>
          </StyledTextContent>
        ) : (
          <StyledTextContent>
            <Trans i18nKey="Delete Workspace Description2">
              Deleting (
              <StyledWorkspaceName>{workspace.name}</StyledWorkspaceName>) will
              delete both local and cloud data, this operation cannot be undone,
              please proceed with caution.
            </Trans>
          </StyledTextContent>
        )}
        <StyledInputContent>
          <Input
            onChange={handlerInputChange}
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
            disabled={deleteStr.toLowerCase() !== 'delete'}
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

export default WorkspaceDelete;
