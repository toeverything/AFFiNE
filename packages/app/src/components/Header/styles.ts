import { styled } from '@/styles';

export const StyledHeader = styled('div')({
  height: '60px',
  width: '100vw',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'relative',
  padding: '0 22px',
});

export const StyledTitle = styled('div')({
  width: '720px',
  height: '100%',
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  margin: 'auto',

  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: '20px',
});

export const StyledTitleWrapper = styled('div')({
  maxWidth: '720px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  position: 'relative',
});

export const StyledLogo = styled('div')({});

export const StyledModeSwitch = styled('div')({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  marginRight: '12px',
});

export const StyledHeaderRightSide = styled('div')({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
});

export const StyledMoreMenuItem = styled('div')({
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '5px',
  fontSize: '14px',
  color: '#4C6275',
  padding: '0 14px',
  svg: {
    fill: '#4C6275',
    width: '16px',
    height: '16px',
    marginRight: '14px',
  },
  ':hover': {
    color: 'var(--affine-highlight-color)',
    background: '#F1F3FF',
    svg: {
      fill: 'var(--affine-highlight-color)',
    },
  },
});

export const IconButton = styled('div')(({ theme }) => {
  return {
    width: '32px',
    height: '32px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: theme.colors.disabled,
    background: 'transparent',
    borderRadius: '5px',
    ':hover': {
      color: theme.colors.highlight,
      background: '#F1F3FF',
    },
  };
});
