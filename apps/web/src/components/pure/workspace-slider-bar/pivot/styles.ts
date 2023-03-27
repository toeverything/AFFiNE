import { IconButton, styled } from '@affine/component';

export const StyledOperationButton = styled('button')(({ theme }) => {
  return {
    height: '20px',
    width: '20px',
    fontSize: '20px',
    color: theme.colors.iconColor,
    display: 'none',
    ':hover': {
      background: theme.colors.hoverBackground,
    },
  };
});

export const StyledCollapsedButton = styled(IconButton, {
  shouldForwardProp: prop => {
    return !['show'].includes(prop as string);
  },
})<{ show: boolean }>(({ show }) => {
  return {
    display: show ? 'block' : 'none',
    position: 'absolute',
    left: '0px',
    top: '0px',
    bottom: '0px',
    margin: 'auto',
  };
});
