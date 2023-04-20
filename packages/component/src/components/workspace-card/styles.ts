import { displayFlex, styled, textEllipsis } from '../..';
import { IconButton } from '../..';

export const StyleWorkspaceInfo = styled('div')(({ theme }) => {
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

export const StyleWorkspaceTitle = styled('div')(({ theme }) => {
  return {
    fontSize: 'var(--affine-font-base)',
    fontWeight: 600,
    lineHeight: '24px',
    marginBottom: '10px',
    maxWidth: '200px',
    ...textEllipsis(1),
  };
});

export const StyledCard = styled('div')<{
  active?: boolean;
}>(({ theme, active }) => {
  const borderColor = active ? 'var(--affine-primary-color)' : 'transparent';
  return {
    width: '310px',
    height: '124px',
    cursor: 'pointer',
    padding: '16px',
    boxShadow: '0px 0px 8px rgba(0, 0, 0, 0.1)',
    borderRadius: '12px',
    border: `1px solid ${borderColor}`,
    ...displayFlex('flex-start', 'flex-start'),
    marginBottom: '24px',
    transition: 'background .2s',
    background: 'var(--affine-background-primary-color)',
    position: 'relative',
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

export const StyledSettingLink = styled(IconButton)(({ theme }) => {
  return {
    position: 'absolute',
    right: '6px',
    bottom: '6px',
    opacity: 0,
    borderRadius: '4px',
    color: 'var(--affine-background-primary-color)',
    pointerEvents: 'none',
    transition: 'all .15s',
    ':hover': {
      background: 'var(--affine-background-primary-color)',
    },
  };
});
