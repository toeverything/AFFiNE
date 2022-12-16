import { styled } from '@/styles';
import { useAppState } from '@/providers/app-state-provider';
import {
  WorkspaceItemAvatar,
  PrivateWorkspaceWrapper,
  WorkspaceItemContent,
} from './styles';

export const PrivateWorkspaceItem = () => {
  const { user } = useAppState();

  return !user ? null : (
    <PrivateWorkspaceWrapper>
      <WorkspaceItemAvatar alt={user.name} src={user.avatar_url}>
        {user.name.charAt(0)}
      </WorkspaceItemAvatar>
      <WorkspaceItemContent>
        <Name title={user.name}>{user.name}</Name>
        <Email title={user.email}>{user.email}</Email>
      </WorkspaceItemContent>
    </PrivateWorkspaceWrapper>
  );
};

const Name = styled('div')(({ theme }) => {
  return {
    color: theme.colors.quoteColor,
    fontSize: theme.font.base,
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
});

const Email = styled('div')(({ theme }) => {
  return {
    color: theme.colors.iconColor,
    fontSize: theme.font.sm,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
});
