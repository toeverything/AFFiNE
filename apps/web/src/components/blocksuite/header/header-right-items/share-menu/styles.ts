import { displayFlex, styled, TextButton } from '@affine/component';

export const StyledShareButton = styled(TextButton)(({ theme }) => {
  return {
    padding: '4px 8px',
    marginLeft: '4px',
    marginRight: '16px',
    border: `1px solid ${theme.colors.primaryColor}`,
    color: theme.colors.primaryColor,
    borderRadius: '8px',
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
        width: 'calc(100% / 3)',
        height: '34px',
        color: isActive ? theme.colors.primaryColor : theme.colors.textColor,
        fontWeight: '500',
        fontSize: theme.font.h6,
        lineHeight: theme.font.lineHeight,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      };
    }
  }
);
export const StyledIndicator = styled('div')<{ activeIndex: number }>(
  ({ theme, activeIndex }) => {
    return {
      height: '2px',
      background: theme.colors.primaryColor,
      position: 'absolute',
      left: `calc(${activeIndex * 100}% / 3)`,
      width: `calc(100% / 3)`,
      transition: 'left .3s, width .3s',
    };
  }
);
