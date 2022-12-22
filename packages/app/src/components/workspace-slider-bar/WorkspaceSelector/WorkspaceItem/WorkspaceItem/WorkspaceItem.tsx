import { useRouter } from 'next/router';
import { styled } from '@/styles';
import {
  WorkspaceItemAvatar,
  WorkspaceItemWrapper,
  WorkspaceItemContent,
} from '../styles';
import { FooterSetting } from './FooterSetting';
import { FooterUsers } from './FooterUsers';
import { WorkspaceType } from '@pathfinder/data-services';

interface WorkspaceItemProps {
  id: string;
  name: string;
  icon: string;
  type: WorkspaceType;
  memberCount: number;
  onClick?: (workspaceId: string) => void;
}

export const WorkspaceItem = ({
  id,
  name,
  icon,
  type,
  onClick,
  memberCount,
}: WorkspaceItemProps) => {
  const router = useRouter();

  const handleClickSetting = async () => {
    onClick && onClick(id);
  };

  return (
    <StyledWrapper
      onClick={() => {
        router.push(`/workspace/${id}`);
      }}
      isPrivate={type === WorkspaceType.Private}
    >
      <WorkspaceItemAvatar alt={name} src={icon}>
        {name.charAt(0)}
      </WorkspaceItemAvatar>
      <WorkspaceItemContent>
        <Name title={name}>{name}</Name>
      </WorkspaceItemContent>
      <Footer>
        <FooterUsers memberCount={memberCount} />
        <FooterSetting onClick={handleClickSetting} />
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

const StyledWrapper = styled(WorkspaceItemWrapper)<{ isPrivate: boolean }>(
  ({ isPrivate }) => {
    return {
      '& .footer-setting': {
        display: 'none',
      },
      ':hover .footer-users': {
        display: isPrivate ? 'block' : 'none',
      },
      ':hover .footer-setting': {
        display: isPrivate ? 'none' : 'block',
      },
    };
  }
);

const Footer = styled('div')({
  width: '42px',
  flex: '0 42px',
  fontSize: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: '12px',
});
