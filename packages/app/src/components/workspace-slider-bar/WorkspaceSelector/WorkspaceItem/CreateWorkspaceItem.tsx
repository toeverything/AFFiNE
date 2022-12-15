import { AddIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import {
  WorkspaceItemAvatar,
  WorkspaceItemWrapper,
  WorkspaceItemContent,
} from './styles';

const name = 'Create new Workspace';

export const CreateWorkspaceItem = () => {
  return (
    <WorkspaceItemWrapper>
      <WorkspaceItemAvatar>
        <AddIcon />
      </WorkspaceItemAvatar>
      <WorkspaceItemContent>
        <Name title={name}>{name}</Name>
      </WorkspaceItemContent>
    </WorkspaceItemWrapper>
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
