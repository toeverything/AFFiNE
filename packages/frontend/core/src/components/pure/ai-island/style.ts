import { displayFlex, positionAbsolute, styled } from '@affine/component';

export const StyledIsland = styled('div')<{
  spread: boolean;
  inEdgelessPage?: boolean;
}>(({ spread, inEdgelessPage }) => {
  return {
    width: '44px',
    position: 'relative',
    boxShadow: spread
      ? 'var(--affine-menu-shadow)'
      : inEdgelessPage
        ? 'var(--affine-menu-shadow)'
        : 'unset',
    padding: '0 4px 44px',
    borderRadius: '50%',
    background: spread
      ? 'var(--affine-background-overlay-panel-color)'
      : 'var(--affine-background-primary-color)',
    ':hover': {
      background: spread ? undefined : 'var(--affine-white)',
      boxShadow: spread ? undefined : 'var(--affine-menu-shadow)',
    },
  };
});

export const StyledTriggerWrapper = styled('div')<{
  spread?: boolean;
}>(({ spread }) => {
  return {
    width: '36px',
    height: '36px',
    cursor: 'pointer',
    color: 'var(--affine-icon-color)',
    borderRadius: '5px',
    fontSize: '24px',
    ...displayFlex('center', 'center'),
    ...positionAbsolute({ left: '4px', bottom: '4px' }),
    ':hover': {
      backgroundColor: spread ? 'var(--affine-hover-color)' : undefined,
    },
  };
});
