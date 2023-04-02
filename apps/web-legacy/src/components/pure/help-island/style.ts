import { displayFlex, positionAbsolute, styled } from '@affine/component';

export const StyledIsland = styled('div')<{
  spread: boolean;
}>(({ theme, spread }) => {
  return {
    transition: 'box-shadow 0.2s',
    width: '44px',
    position: 'relative',
    boxShadow: spread
      ? '4px 4px 7px rgba(58, 76, 92, 0.04), -4px -4px 13px rgba(58, 76, 92, 0.02), 6px 6px 36px rgba(58, 76, 92, 0.06)'
      : 'unset',
    padding: '0 4px 44px',
    borderRadius: '10px',
    backgroundColor: theme.colors.pageBackground,
    ':hover': {
      boxShadow:
        '4px 4px 7px rgba(58, 76, 92, 0.04), -4px -4px 13px rgba(58, 76, 92, 0.02), 6px 6px 36px rgba(58, 76, 92, 0.06)',
    },
    '::after': {
      content: '""',
      width: '36px',
      height: '1px',
      background: spread ? theme.colors.borderColor : 'transparent',
      ...positionAbsolute({
        left: 0,
        right: 0,
        bottom: '44px',
      }),
      margin: 'auto',
      transition: 'background 0.15s',
    },
  };
});
export const StyledIconWrapper = styled('div')(({ theme }) => {
  return {
    color: theme.colors.iconColor,
    ...displayFlex('center', 'center'),
    cursor: 'pointer',
    backgroundColor: theme.colors.pageBackground,
    borderRadius: '5px',
    width: '36px',
    height: '36px',
    margin: '4px auto 4px',
    transition: 'background-color 0.2s',
    position: 'relative',
    ':hover': {
      color: theme.colors.primaryColor,
      backgroundColor: theme.colors.hoverBackground,
    },
  };
});

export const StyledAnimateWrapper = styled('div')(() => ({
  transition: 'height 0.2s cubic-bezier(0, 0, 0.55, 1.6)',
  overflow: 'hidden',
}));

export const StyledTriggerWrapper = styled('div')(({ theme }) => {
  return {
    width: '36px',
    height: '36px',
    cursor: 'pointer',
    backgroundColor: theme.colors.pageBackground,
    color: theme.colors.iconColor,
    borderRadius: '5px',
    fontSize: '24px',
    ...displayFlex('center', 'center'),
    ...positionAbsolute({ left: '4px', bottom: '4px' }),
    ':hover': {
      color: theme.colors.primaryColor,
    },
  };
});
