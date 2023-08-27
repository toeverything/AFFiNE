import { IconButton } from '@toeverything/components/button';

import { displayFlex, styled, textEllipsis } from '../../../styles';

export const StyledWorkspaceInfo = styled('div')(() => {
  return {
    marginLeft: '15px',
    width: '202px',
    p: {
      height: '20px',
      fontSize: 'var(--affine-font-sm)',
      ...displayFlex('flex-start', 'center'),
    },
    svg: {
      marginRight: '10px',
      fontSize: '16px',
      flexShrink: 0,
    },
    span: {
      flexGrow: 1,
      ...textEllipsis(1),
    },
  };
});

export const StyledWorkspaceTitle = styled('div')(() => {
  return {
    fontSize: 'var(--affine-font-base)',
    fontWeight: 600,
    lineHeight: '24px',
    maxWidth: '200px',
    color: 'var(--affine-text-primary-color)',
    ...textEllipsis(1),
  };
});

export const StyledCard = styled('div')<{
  active?: boolean;
}>(({ active }) => {
  const borderColor = active ? 'var(--affine-primary-color)' : 'transparent';
  const backgroundColor = active ? 'var(--affine-white)' : 'transparent';
  return {
    width: '280px',
    height: '58px',
    cursor: 'pointer',
    padding: '16px',
    borderRadius: '12px',
    border: `1px solid ${borderColor}`,
    ...displayFlex('flex-start', 'flex-start'),
    marginBottom: '12px',
    transition: 'background .2s',
    alignItems: 'center',
    position: 'relative',
    color: 'var(--affine-text-secondary-color)',
    background: backgroundColor,
    ':hover': {
      background: 'var(--affine-hover-color)',
      '.add-icon': {
        borderColor: 'var(--affine-primary-color)',
        color: 'var(--affine-primary-color)',
      },
      '.setting-entry': {
        opacity: 1,
        pointerEvents: 'auto',
      },
    },
    '@media (max-width: 720px)': {
      width: '100%',
    },
  };
});

export const StyledModalHeader = styled('div')(() => {
  return {
    width: '100%',
    height: '72px',
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: '24px 24px 0 0',
    padding: '0 40px',
    ...displayFlex('space-between', 'center'),
  };
});

export const StyledSettingLink = styled(IconButton)(() => {
  return {
    position: 'absolute',
    right: '6px',
    bottom: '6px',
    opacity: 0,
    borderRadius: '4px',
    color: 'var(--affine-primary-color)',
    pointerEvents: 'none',
    transition: 'all .15s',
    ':hover': {
      background: 'var(--affine-hover-color)',
    },
  };
});

export const StyledWorkspaceType = styled('p')(() => {
  return {
    fontSize: 10,
  };
});

export const StyledWorkspaceTitleArea = styled('div')(() => {
  return {
    display: 'flex',
    justifyContent: 'space-between',
  };
});
