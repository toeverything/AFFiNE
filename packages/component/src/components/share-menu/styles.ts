import { Button, displayFlex, styled, TextButton } from '../..';

export const StyledShareButton = styled(TextButton, {
  shouldForwardProp: (prop: string) => prop !== 'isShared',
})<{ isShared?: boolean }>(({ theme, isShared }) => {
  return {
    padding: '4px 8px',
    marginLeft: '4px',
    marginRight: '16px',
    border: `1px solid ${
      isShared ? 'var(--affine-primary-color)' : 'var(--affine-icon-color)'
    }`,
    color: isShared
      ? 'var(--affine-primary-color)'
      : 'var(--affine-icon-color)',
    borderRadius: '8px',
    ':hover': {
      border: `1px solid ${'var(--affine-primary-color)'}`,
    },
    span: {
      ...displayFlex('center', 'center'),
    },
  };
});

export const StyledTabsWrapper = styled('div')(() => {
  return {
    ...displayFlex('space-around', 'center'),
    position: 'relative',
  };
});

export const TabItem = styled('li')<{ isActive?: boolean }>(
  ({ theme, isActive }) => {
    {
      return {
        ...displayFlex('center', 'center'),
        flex: '1',
        height: '30px',
        color: 'var(--affine-text-primary-color)',
        opacity: isActive ? 1 : 0.2,
        fontWeight: '500',
        fontSize: 'var(--affine-font-base)',
        lineHeight: 'var(--affine-line-height)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        padding: '0 10px',
        marginBottom: '4px',
        borderRadius: '4px',
        position: 'relative',
        ':hover': {
          background: 'var(--affine-hover-color)',
          opacity: 1,
          color: isActive
            ? 'var(--affine-text-primary-color)'
            : 'var(--affine-text-secondary-color)',
          svg: {
            fill: isActive
              ? 'var(--affine-text-primary-color)'
              : 'var(--affine-text-secondary-color)',
          },
        },
        svg: {
          fontSize: '20px',
          marginRight: '12px',
        },
        ':after': {
          content: '""',
          position: 'absolute',
          bottom: '-6px',
          left: '0',
          width: '100%',
          height: '2px',
          background: 'var(--affine-text-primary-color)',
          opacity: 0.2,
        },
      };
    }
  }
);
export const StyledIndicator = styled('div')(({ theme }) => {
  return {
    height: '2px',
    background: 'var(--affine-text-primary-color)',
    position: 'absolute',
    left: '0',
    transition: 'left .3s, width .3s',
  };
});
export const StyledInput = styled('input')(({ theme }) => {
  return {
    padding: '4px 8px',
    height: '28px',
    color: 'var(--affine-placeholder-color)',
    border: `1px solid ${'var(--affine-placeholder-color)'}`,
    cursor: 'default',
    overflow: 'hidden',
    userSelect: 'text',
    borderRadius: '4px',
    flexGrow: 1,
    marginRight: '10px',
  };
});
export const StyledButton = styled(TextButton)(({ theme }) => {
  return {
    color: 'var(--affine-primary-color)',
    height: '32px',
    background: '#F3F0FF',
    border: 'none',
    borderRadius: '8px',
    padding: '4px 20px',
  };
});
export const StyledDisableButton = styled(Button)(() => {
  return {
    color: '#FF631F',
    height: '32px',
    border: 'none',
    marginTop: '16px',
    borderRadius: '8px',
    padding: '0',
  };
});
export const StyledLinkSpan = styled('span')(({ theme }) => {
  return {
    marginLeft: '4px',
    color: 'var(--affine-primary-color)',
    fontWeight: '500',
    cursor: 'pointer',
  };
});
