import { displayFlex, styled } from '../../styles';
import StyledPopperContainer from '../shared/Container';
import { ArrowRightIcon } from '@blocksuite/icons';

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

export const StyledArrow = styled(ArrowRightIcon)({
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 0,
  margin: 'auto',
});

export const StyledMenuItem = styled.button<{
  isDir?: boolean;
}>(({ theme, isDir = false }) => {
  return {
    width: '100%',
    borderRadius: '5px',
    padding: '0 14px',
    fontSize: '14px',
    height: '32px',
    ...displayFlex('flex-start', 'center'),
    cursor: isDir ? 'pointer' : '',
    position: 'relative',
    color: theme.colors.popoverColor,
    backgroundColor: 'transparent',

    ':hover': {
      color: theme.colors.primaryColor,
      backgroundColor: theme.colors.hoverBackground,
    },
  };
});
