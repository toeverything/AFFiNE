import {
  displayFlex,
  IconButton,
  styled,
  textEllipsis,
} from '@affine/component';

export const StyledPivotItem = styled('div')<{ active: boolean }>(
  ({ active, theme }) => {
    return {
      width: '100%',
      height: '32px',
      ...displayFlex('flex-start', 'center'),
      paddingLeft: '24px',
      position: 'relative',
      color: active ? theme.colors.primaryColor : theme.colors.textColor,
      cursor: 'pointer',
      span: {
        flexGrow: '1',
        ...textEllipsis(1),
      },
      '.pivot-item-button': {
        display: 'none',
      },
      ':hover': {
        '.pivot-item-button': {
          display: 'flex',
        },
      },
    };
  }
);

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
