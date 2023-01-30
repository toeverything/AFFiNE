import { MuiAvatar } from '@/ui/mui';
import { styled } from '@/styles';

export const WorkspaceItemWrapper = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  cursor: 'pointer',
  borderRadius: '5px',
  padding: '6px 12px',

  ':hover': {
    color: theme.colors.primaryColor,
    backgroundColor: theme.colors.hoverBackground,
  },
}));

export const PrivateWorkspaceWrapper = styled(WorkspaceItemWrapper)({
  padding: '10px 12px',
});

export const LoginItemWrapper = styled(WorkspaceItemWrapper)(({ theme }) => {
  return {
    padding: '10px 12px',

    ':hover .login-description': {
      color: theme.colors.primaryColor,
    },
  };
});

export const WorkspaceItemAvatar = styled(MuiAvatar)({
  height: '40px',
  width: '40px',
});

export const WorkspaceItemContent = styled('div')({
  minWidth: 0,
  marginLeft: '12px',
  flexGrow: 1,
});
