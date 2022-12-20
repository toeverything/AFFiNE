import { styled } from '@/styles';
import { useAppState } from '@/providers/app-state-provider/context';
import {
  WorkspaceItemAvatar,
  PrivateWorkspaceWrapper,
  WorkspaceItemContent,
} from './styles';

export const PrivateWorkspaceItem = () => {
  const { user } = useAppState();
  // @ts-ignore
  const Username = user.name;
  return !user ? null : (
    <PrivateWorkspaceWrapper>
      <WorkspaceItemAvatar alt={Username} src={user.avatar_url}>
        {Username}
      </WorkspaceItemAvatar>
      <WorkspaceItemContent>
        <Name title={Username}>{Username}</Name>
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
