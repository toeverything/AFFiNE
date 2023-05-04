import { alpha, displayFlex, styled, textEllipsis } from '@affine/component';

export const StyledListItem = styled('div')<{
  active?: boolean;
  disabled?: boolean;
}>(({ active, disabled }) => {
  return {
    height: '32px',
    color: active
      ? 'var(--affine-primary-color)'
      : 'var(--affine-text-primary-color)',
    paddingLeft: '2px',
    paddingRight: '2px',
    borderRadius: '8px',
    cursor: 'pointer',
    marginBottom: '4px',
    position: 'relative',
    flexShrink: 0,
    userSelect: 'none',
    ...displayFlex('flex-start', 'stretch'),
    ...(disabled
      ? {
          cursor: 'not-allowed',
          color: 'var(--affine-border-color)',
        }
      : {}),

    'a > svg, div > svg': {
      fontSize: '20px',
      marginLeft: '14px',
      marginRight: '12px',
      color: active
        ? 'var(--affine-primary-color)'
        : 'var(--affine-icon-color)',
    },
    ':hover:not([disabled])': {
      backgroundColor: 'var(--affine-hover-color)',
    },
  };
});

export const StyledCollapseButton = styled('button')<{
  collapse: boolean;
  show?: boolean;
}>(({ collapse, show = true }) => {
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
    color: 'var(--affine-icon-color)',
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
  textWrap?: boolean;
}>(({ disable = false, active = false, isOver, textWrap = false }) => {
  return {
    width: '100%',
    lineHeight: '1.5',
    minHeight: '32px',
    borderRadius: '8px',
    ...displayFlex('flex-start', 'center'),
    paddingRight: '2px',
    position: 'relative',
    color: disable
      ? 'var(--affine-text-disable-color)'
      : active
      ? 'var(--affine-primary-color)'
      : 'var(--affine-text-primary-color)',
    cursor: disable ? 'not-allowed' : 'pointer',
    background: isOver ? alpha('var(--affine-primary-color)', 0.06) : '',
    userSelect: 'none',
    ...(textWrap
      ? {
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }
      : {}),
    span: {
      flexGrow: '1',
      textAlign: 'left',
      ...textEllipsis(1),
    },
    '> svg': {
      fontSize: '20px',
      marginRight: '8px',
      flexShrink: '0',
      color: active
        ? 'var(--affine-primary-color)'
        : 'var(--affine-icon-color)',
    },

    ':hover': disable
      ? {}
      : {
          backgroundColor: 'var(--affine-hover-color)',
          '.operation-button': {
            visibility: 'visible',
          },
        },
  };
});

export const StyledRouteNavigationWrapper = styled('div')({
  height: '32px',
  width: '80px',
  marginRight: '16px',
  ...displayFlex('space-between', 'center'),
});
