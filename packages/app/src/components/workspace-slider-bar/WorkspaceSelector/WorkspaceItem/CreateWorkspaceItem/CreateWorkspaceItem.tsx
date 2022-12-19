import { useState } from 'react';
import { AddIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import {
  WorkspaceItemAvatar,
  WorkspaceItemWrapper,
  WorkspaceItemContent,
} from '../styles';
import { WorkspaceCreate } from './workspace-create';

const name = 'Create new Workspace';

export const CreateWorkspaceItem = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <WorkspaceItemWrapper onClick={() => setOpen(true)}>
        <WorkspaceItemAvatar>
          <AddIcon />
        </WorkspaceItemAvatar>
        <WorkspaceItemContent>
          <Name title={name}>{name}</Name>
        </WorkspaceItemContent>
      </WorkspaceItemWrapper>
      <WorkspaceCreate open={open} onClose={() => setOpen(false)} />
    </>
  );
};

const Name = styled('div')(({ theme }) => {
  return {
    color: theme.colors.quoteColor,
    fontSize: theme.font.base,
    fontWeight: 400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
});
