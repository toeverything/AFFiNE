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
      transform: `rotate(${collapse ? '-90' : '0'}deg)`,
    },
    ':hover': {
      opacity: '1',
    },
  };
});

export const StyledPinboard = styled('div')<{
  disable?: boolean;
  active?: boolean;
  isOver?: boolean;
  disableCollapse?: boolean;
  textWrap?: boolean;
}>(
  ({
    disableCollapse,
    disable = false,
    active = false,
    theme,
    isOver,
    textWrap = false,
  }) => {
    return {
      width: '100%',
      lineHeight: '1.5',
      minHeight: '32px',
      borderRadius: '8px',
      ...displayFlex('flex-start', 'center'),
      padding: disableCollapse ? '0 5px' : '0 2px 0 16px',
      position: 'relative',
      color: disable
        ? 'var(--affine-text-disable-color)'
        : active
        ? 'var(--affine-primary-color)'
        : 'var(--affine-text-primary-color)',
      cursor: disable ? 'not-allowed' : 'pointer',
      background: isOver ? alpha('var(--affine-primary-color)', 0.06) : '',
      fontSize: 'var(--affine-font-base)',
      userSelect: 'none',
      ...(textWrap
        ? {
            wordBreak: 'break-all',
            whiteSpace: 'pre-wrap',
          }
        : {}),

      span: {
        flexGrow: '1',
        textAlign: 'left',
        ...textEllipsis(1),
      },
      '.path-icon': {
        fontSize: '16px',
        transform: 'translateY(-4px)',
      },
      '.mode-icon': {
        fontSize: '20px',
        marginRight: '8px',
        flexShrink: '0',
        color: active
          ? 'var(--affine-primary-color)'
          : 'var(--affine-icon-color)',
      },

      ':hover': {
        backgroundColor: disable ? '' : 'var(--affine-hover-color)',
      },
    };
  }
);

export const StyledOperationButton = styled(IconButton, {
  shouldForwardProp: prop => {
    return !['visible'].includes(prop as string);
  },
})<{ visible: boolean }>(({ visible }) => {
  return {
    visibility: visible ? 'visible' : 'hidden',
  };
});

export const StyledSearchContainer = styled('div')(({ theme }) => {
  return {
    width: 'calc(100% - 24px)',
    margin: '0 auto',
    ...displayFlex('flex-start', 'center'),
    borderBottom: '1px solid var(--affine-border-color)',
    label: {
      color: 'var(--affine-icon-color)',
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
    color: 'var(--affine-text-secondary-color)',
    lineHeight: '36px',
    padding: '0 12px',
  };
});

export const StyledMenuFooter = styled('div')(({ theme }) => {
  return {
    width: 'calc(100% - 24px)',
    margin: '0 auto',
    borderTop: '1px solid var(--affine-border-color)',
    padding: '6px 0',

    p: {
      paddingLeft: '44px',
      color: 'var(--affine-text-secondary-color)',
      fontSize: '14px',
    },
  };
});
