import { IconButton } from '@toeverything/components/button';

import { displayFlex, styled, textEllipsis } from '../../../styles';

export const StyledWorkspaceInfo = styled('div')(() => {
  return {
    marginLeft: '12px',
    width: '100%',
  };
});

export const StyledWorkspaceTitle = styled('div')(() => {
  return {
    fontSize: 'var(--affine-font-sm)',
    fontWeight: 700,
    lineHeight: '22px',
    maxWidth: '190px',
    color: 'var(--affine-text-primary-color)',
    ...textEllipsis(1),
  };
});

export const StyledCard = styled('div')<{
  active?: boolean;
}>(({ active }) => {
  const borderColor = active ? 'var(--affine-primary-color)' : 'transparent';
  const backgroundColor = active ? 'var(--affine-white-30)' : 'transparent';
  return {
    width: '100%',
    cursor: 'pointer',
    padding: '12px',
    borderRadius: '8px',
    border: `1px solid ${borderColor}`,
    ...displayFlex('flex-start', 'flex-start'),
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
        backgroundColor: 'var(--affine-white-30)',
        boxShadow: 'var(--affine-shadow-1)',
        ':hover': {
          background:
            'linear-gradient(0deg, var(--affine-hover-color) 0%, var(--affine-hover-color) 100%), var(--affine-white-30)',
        },
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
    right: '10px',
    top: '10px',
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

export const StyledWorkspaceType = styled('div')(() => {
  return {
    ...displayFlex('flex-start', 'center'),
    width: '100%',
    height: '20px',
  };
});

export const StyledWorkspaceTitleArea = styled('div')(() => {
  return {
    display: 'flex',
    justifyContent: 'space-between',
  };
});

export const StyledWorkspaceTypeEllipse = styled('div')<{
  cloud?: boolean;
}>(({ cloud }) => {
  return {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: cloud
      ? 'var(--affine-palette-shape-blue)'
      : 'var(--affine-palette-shape-green)',
  };
});

export const StyledWorkspaceTypeText = styled('div')(() => {
  return {
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '20px',
    marginLeft: '4px',
    color: 'var(--affine-text-secondary-color)',
  };
});

export const StyledIconContainer = styled('div')(() => {
  return {
    ...displayFlex('flex-start', 'center'),
    fontSize: '14px',
    gap: '8px',
    color: 'var(--affine-icon-secondary)',
  };
});
