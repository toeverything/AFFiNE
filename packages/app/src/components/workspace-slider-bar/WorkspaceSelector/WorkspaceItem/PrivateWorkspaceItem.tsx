import { styled } from '@/styles';
import {
  WorkspaceItemAvatar,
  PrivateWorkspaceWrapper,
  WorkspaceItemContent,
} from './styles';

interface PrivateWorkspaceItemProps {
  name: string;
  icon: string;
  email: string;
}

export const PrivateWorkspaceItem = ({
  name,
  icon,
  email,
}: PrivateWorkspaceItemProps) => {
  return (
    <PrivateWorkspaceWrapper>
      <WorkspaceItemAvatar alt={name} src={icon}>
        {name.charAt(0)}
      </WorkspaceItemAvatar>
      <WorkspaceItemContent>
        <Name title={name}>{name}</Name>
        <Email title={email}>{email}</Email>
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
