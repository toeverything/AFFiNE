import {
  alpha,
  displayFlex,
  IconButton,
  styled,
  textEllipsis,
} from '@affine/component';

export const StyledCollapsedButton = styled('button')<{
  collapse: boolean;
  show?: boolean;
}>(({ collapse, show = true, theme }) => {
  return {
    width: '16px',
    height: '16px',
    fontSize: '16px',
    position: 'absolute',
    left: '0',
    top: '0',
    bottom: '0',
    margin: 'auto',
    color: theme.colors.iconColor,
    opacity: '.6',
    display: show ? 'block' : 'none',
    svg: {
      transform: `rotate(${collapse ? '0' : '-90'}deg)`,
    },
  };
});

export const StyledPivot = styled('div')<{
  disable?: boolean;
  active?: boolean;
  isOver?: boolean;
}>(({ disable = false, active = false, theme, isOver }) => {
  return {
    width: '100%',
    height: '32px',
    borderRadius: '8px',
    ...displayFlex('flex-start', 'center'),
    padding: '0 2px 0 16px',
    position: 'relative',
    color: disable
      ? theme.colors.disableColor
      : active
      ? theme.colors.primaryColor
      : theme.colors.textColor,
    cursor: disable ? 'not-allowed' : 'pointer',
    background: isOver ? alpha(theme.colors.primaryColor, 0.06) : '',
    fontSize: theme.font.base,
    span: {
      flexGrow: '1',
      textAlign: 'left',
      ...textEllipsis(1),
    },
    '> svg': {
      fontSize: '20px',
      marginRight: '8px',
      flexShrink: '0',
      color: active ? theme.colors.primaryColor : theme.colors.iconColor,
    },

    ':hover': {
      backgroundColor: disable ? '' : theme.colors.hoverBackground,
    },
  };
});

export const StyledOperationButton = styled(IconButton)<{ visible: boolean }>(
  ({ visible }) => {
    return {
      visibility: visible ? 'visible' : 'hidden',
    };
  }
);

export const StyledSearchContainer = styled('div')(({ theme }) => {
  return {
    width: 'calc(100% - 24px)',
    margin: '0 auto',
    ...displayFlex('flex-start', 'center'),
    borderBottom: `1px solid ${theme.colors.borderColor}`,
    label: {
      color: theme.colors.iconColor,
      fontSize: '20px',
      height: '20px',
    },
  };
});
export const StyledMenuContent = styled('div')(() => {
  return {
    height: '266px',
    overflow: 'auto',
  };
});
export const StyledMenuSubTitle = styled('div')(({ theme }) => {
  return {
    color: theme.colors.secondaryTextColor,
    lineHeight: '36px',
    padding: '0 12px',
  };
});

export const StyledMenuFooter = styled('div')(({ theme }) => {
  return {
    width: 'calc(100% - 24px)',
    margin: '0 auto',
    borderTop: `1px solid ${theme.colors.borderColor}`,
    padding: '6px 0',

    p: {
      paddingLeft: '44px',
      color: theme.colors.secondaryTextColor,
      fontSize: '14px',
    },
  };
});
