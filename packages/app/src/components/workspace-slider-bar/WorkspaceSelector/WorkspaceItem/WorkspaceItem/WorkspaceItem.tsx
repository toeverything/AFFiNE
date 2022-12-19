import { styled } from '@/styles';
import {
  WorkspaceItemAvatar,
  WorkspaceItemWrapper,
  WorkspaceItemContent,
} from '../styles';
import { FooterSetting } from './FooterSetting';
import { FooterUsers } from './FooterUsers';

interface WorkspaceItemProps {
  id: string;
  name: string;
  icon: string;
}

export const WorkspaceItem = ({ name, icon }: WorkspaceItemProps) => {
  return (
    <StyledWrapper>
      <WorkspaceItemAvatar alt={name} src={icon}>
        {name.charAt(0)}
      </WorkspaceItemAvatar>
      <WorkspaceItemContent>
        <Name title={name}>{name}</Name>
      </WorkspaceItemContent>
      <Footer>
        <FooterUsers />
        <FooterSetting />
      </Footer>
    </StyledWrapper>
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

const StyledWrapper = styled(WorkspaceItemWrapper)({
  '& .footer-setting': {
    display: 'none',
  },
  ':hover .footer-users': {
    display: 'none',
  },
  ':hover .footer-setting': {
    display: 'block',
  },
});

const Footer = styled('div')({
  width: '42px',
  flex: '0 42px',
  fontSize: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: '12px',
});
