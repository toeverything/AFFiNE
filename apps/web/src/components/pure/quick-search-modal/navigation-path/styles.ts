import { displayFlex, styled, textEllipsis } from '@affine/component';

export const StyledNavigationPathContainer = styled('div')(() => {
  return {
    height: '46px',
    ...displayFlex('flex-start', 'center'),
    background: 'var(--affine-background-secondary-color)',
    padding: '0 40px 0 20px',
    position: 'relative',
    fontSize: 'var(--affine-font-sm)',
    zIndex: 2,
    '.collapse-btn': {
      position: 'absolute',
      right: '12px',
      top: 0,
      bottom: 0,
      margin: 'auto',
    },
    '.path-arrow': {
      fontSize: '16px',
      color: 'var(--affine-icon-color)',
    },
  };
});

export const StyledNavPathLink = styled('div')<{ active?: boolean }>(
  ({ active }) => {
    return {
      color: active
        ? 'var(--affine-text-primary-color)'
        : 'var(--affine-text-secondary-color)',
      cursor: active ? 'auto' : 'pointer',
      maxWidth: '160px',
      ...textEllipsis(1),
      padding: '0 4px',
      transition: 'background .15s',
      ':hover': active
        ? {}
        : {
            background: 'var(--affine-hover-color)',
            borderRadius: '4px',
          },
    };
  }
);

export const StyledNavPathExtendContainer = styled('div')<{ show: boolean }>(
  ({ show }) => {
    return {
      position: 'absolute',
      left: '0',
      top: show ? '0' : '-100%',
      zIndex: '1',
      height: '100%',
      width: '100%',
      background: 'var(--affine-background-secondary-color)',
      transition: 'top .15s',
      fontSize: 'var(--affine-font-sm)',
      color: 'var(--affine-text-secondary-color)',
      padding: '46px 12px 0 15px',
    };
  }
);
