import MuiAvatar from '@mui/material/Avatar';
import { styled } from '@/styles';
import { StyledPopperContainer } from '@/ui/shared/Container';

export const SelectorWrapper = styled('div')({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  ':hover': {
    cursor: 'pointer',
  },
});

export const Avatar = styled(MuiAvatar)({
  height: '28px',
  width: '28px',
});

export const WorkspaceName = styled('span')(({ theme }) => {
  return {
    marginLeft: '12px',
    lineHeight: 1,
    fontSize: '18px',
    fontWeight: 500,
    color: theme.colors.iconColor,
  };
});

export const SelectorPopperContainer = styled(StyledPopperContainer)(
  ({ theme }) => {
    return {
      width: '334px',
      boxShadow: theme.shadow.tooltip,
      padding: '24px 12px',
      backgroundColor: theme.colors.pageBackground,
      fontSize: theme.font.xs,
    };
  }
);
