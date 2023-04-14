import {
  alpha,
  displayFlex,
  keyframes,
  styled,
  textEllipsis,
} from '@affine/component';

export const StyledListItem = styled('div')<{
  active?: boolean;
  disabled?: boolean;
}>(({ theme, active, disabled }) => {
  return {
    height: '32px',
    color: active ? theme.colors.primaryColor : theme.colors.textColor,
    padding: '0 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '4px',
    position: 'relative',
    flexShrink: 0,
    userSelect: 'none',
    ...displayFlex('flex-start', 'center'),
    ...(disabled
      ? {
          cursor: 'not-allowed',
          color: theme.colors.borderColor,
        }
      : {}),

    '> svg, a > svg': {
      fontSize: '20px',
      marginRight: '12px',
      color: active ? theme.colors.primaryColor : theme.colors.iconColor,
    },
    ':hover:not([disabled])': {
      backgroundColor: theme.colors.hoverBackground,
    },
  };
});

export const StyledCollapseButton = styled('button')<{
  collapse: boolean;
  show?: boolean;
}>(({ collapse, show = true, theme }) => {
  return {
    width: '16px',
    height: '100%',
    ...displayFlex('center', 'center'),
    fontSize: '16px',
    position: 'absolute',
    left: '0',
    top: '0',
    bottom: '0',
    margin: 'auto',
    color: theme.colors.iconColor,
    opacity: '.6',
    transition: 'opacity .15s ease-in-out',
    display: show ? 'flex' : 'none',
    svg: {
      transform: `rotate(${collapse ? '0' : '-90'}deg)`,
    },
    ':hover': {
      opacity: '1',
    },
  };
});

export const StyledCollapseItem = styled('div')<{
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
    userSelect: 'none',

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
    '.operation-button': {
      visibility: 'hidden',
    },

    ':hover': disable
      ? {}
      : {
          backgroundColor: theme.colors.hoverBackground,
          '.operation-button': {
            visibility: 'visible',
          },
        },
  };
});

const slideIn = keyframes({
  '0%': {
    height: '0px',
  },
  '50%': {
    height: '36px',
  },
  '100%': {
    height: '32px',
  },
});
const slideIn2 = keyframes({
  '0%': {
    transform: 'translateX(100%)',
  },
  '50%': {
    transform: 'translateX(100%)',
  },
  '80%': {
    transform: 'translateX(-10%)',
  },
  '100%': {
    transform: 'translateX(0%)',
  },
});

const slideOut = keyframes({
  '0%': {
    height: '32px',
  },
  '60%': {
    height: '32px',
  },
  '80%': {
    height: '32px',
  },
  '100%': {
    height: '0px',
  },
});
const slideOut2 = keyframes({
  '0%': {
    transform: 'translateX(0%)',
  },
  '100%': {
    transform: 'translateX(100%)',
  },
});

export const StyledChangeLog = styled('div')<{
  isClose?: boolean;
}>(({ theme, isClose }) => {
  return {
    width: '110%',
    height: '32px',
    ...displayFlex('flex-start', 'center'),
    color: theme.colors.primaryColor,
    backgroundColor: theme.colors.hoverBackground,
    border: `1px solid ${theme.colors.primaryColor}`,
    borderRight: 'none',
    marginLeft: '8px',
    paddingLeft: '8px',
    borderRadius: '16px 0 0 16px',
    cursor: 'pointer',
    zIndex: 1001,
    position: 'absolute',
    userSelect: 'none',
    transition: 'all 0.3s',
    animation: isClose
      ? `${slideOut2} .3s ease-in-out forwards`
      : `${slideIn2} 1s ease-in-out forwards`,
    '> svg, a > svg': {
      fontSize: '20px',
      marginRight: '12px',
      color: theme.colors.primaryColor,
    },
    button: {
      marginRight: '12%',
    },
  };
});
export const StyledChangeLogWrapper = styled('div')<{
  isClose?: boolean;
}>(({ isClose }) => {
  return {
    width: 'calc(100% + 4px)',
    height: '0px',
    animation: isClose
      ? `${slideOut} .3s ease-in-out forwards`
      : `${slideIn} 1s ease-in-out forwards`,
    ...displayFlex('flex-start', 'center'),
    marginBottom: '4px',
    position: 'relative',
    userSelect: 'none',
    transition: 'all 0.3s',
    overflow: 'hidden',
  };
});

export const StyledRouteNavigationWrapper = styled('div')({
  height: '32px',
  width: '80px',
  marginRight: '16px',
  ...displayFlex('space-between', 'center'),
});
