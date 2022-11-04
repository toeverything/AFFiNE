import { styled } from '@/styles';
import StyledPopperContainer from '../shared/Container';

export const StyledMenuWrapper = styled(StyledPopperContainer)(({ theme }) => {
  return {
    background: theme.colors.popoverBackground,
    padding: '8px 4px',
    fontSize: '14px',
    backgroundColor: theme.colors.popoverBackground,
    boxShadow: theme.shadow.popover,
    color: theme.colors.popoverColor,
  };
});

export const StyledMenuItem = styled('div')<{ popperVisible?: boolean }>(
  ({ theme, popperVisible }) => {
    return {
      borderRadius: '5px',
      padding: '0 14px',

      color: popperVisible
        ? theme.colors.primaryColor
        : theme.colors.popoverColor,
      backgroundColor: popperVisible
        ? theme.colors.hoverBackground
        : 'transparent',

      ':hover': {
        color: theme.colors.primaryColor,
        backgroundColor: theme.colors.hoverBackground,
      },
    };
  }
);
