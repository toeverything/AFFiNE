import type { ReactNode } from 'react';
import { styled } from '@/styles';
import { WorkspaceItemWrapper, WorkspaceItemContent } from './styles';

interface ListItemProps {
  name: string;
  icon: ReactNode;
  onClick: () => void;
}

export const ListItem = ({ name, icon, onClick }: ListItemProps) => {
  return (
    <WorkspaceItemWrapper onClick={onClick}>
      <StyledIconWrapper>{icon}</StyledIconWrapper>
      <WorkspaceItemContent>
        <Name title={name}>{name}</Name>
      </WorkspaceItemContent>
    </WorkspaceItemWrapper>
  );
};

const Name = styled('div')(({ theme }) => {
  return {
    color: theme.colors.quoteColor,
    fontSize: theme.font.sm,
    fontWeight: 400,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
});

const StyledIconWrapper = styled('div')({
  width: '20px',
  height: '20px',
  fontSize: '20px',
});
