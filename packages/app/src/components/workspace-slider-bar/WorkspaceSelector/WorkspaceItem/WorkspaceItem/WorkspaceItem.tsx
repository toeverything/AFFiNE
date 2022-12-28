import { useRouter } from 'next/router';
import { styled } from '@/styles';
import {
  WorkspaceItemAvatar,
  WorkspaceItemWrapper,
  WorkspaceItemContent,
} from '../styles';
import { FooterSetting } from './FooterSetting';
import { FooterUsers } from './FooterUsers';
import { WorkspaceType } from '@affine/data-services';
import { useAppState } from '@/providers/app-state-provider';

interface WorkspaceItemProps {
  id: string;
  name: string;
  icon: string;
  type: WorkspaceType;
  memberCount: number;
  onClickSetting?: (workspaceId: string) => void;
}

export const WorkspaceItem = ({
  id,
  name,
  icon,
  type,
  onClickSetting,
  memberCount,
}: WorkspaceItemProps) => {
  const router = useRouter();

  const { currentWorkspaceId } = useAppState();

  const handleClickSetting = async () => {
    onClickSetting && onClickSetting(id);
  };

  return (
    <StyledWrapper
      onClick={() => {
        router.push(`/workspace/${id}`);
      }}
      canSet={
        type !== WorkspaceType.Private && currentWorkspaceId === String(id)
      }
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

const StyledWrapper = styled(WorkspaceItemWrapper)<{ canSet: boolean }>(
  ({ canSet }) => {
    return {
      '& .footer-setting': {
        display: 'none',
      },
      ':hover .footer-users': {
        display: canSet ? 'none' : '',
      },
      ':hover .footer-setting': {
        display: canSet ? 'block' : 'none',
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
