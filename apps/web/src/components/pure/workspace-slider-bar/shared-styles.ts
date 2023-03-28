import { alpha, displayFlex, styled, textEllipsis } from '@affine/component';

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
