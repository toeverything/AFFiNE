import { displayFlex, textEllipsis } from '@affine/component';
import { styled } from '@affine/component';
export const StyledSelectorContainer = styled('div')(({ theme }) => {
  return {
    height: '58px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 6px',
    marginBottom: '16px',
    borderRadius: '8px',
    color: 'var(--affine-text-primary-color)',
    ':hover': {
      cursor: 'pointer',
      background: 'var(--affine-hover-color)',
    },
  };
});

export const StyledSelectorWrapper = styled('div')(() => {
  return {
    marginLeft: '8px',
    flexGrow: 1,
    overflow: 'hidden',
  };
});
export const StyledWorkspaceName = styled('div')(() => {
  return {
    lineHeight: '24px',
    fontWeight: 600,
    userSelect: 'none',
    ...textEllipsis(1),
  };
});

export const StyledWorkspaceStatus = styled('div')(({ theme }) => {
  return {
    height: '22px',
    ...displayFlex('flex-start', 'center'),
    fontSize: 'var(--affine-font-sm)',
    color: 'var(--affine-text-secondary-color)',
    userSelect: 'none',
    svg: {
      color: 'var(--affine-icon-color)',
      fontSize: 'var(--affine-font-base)',
      marginRight: '4px',
    },
  };
});
