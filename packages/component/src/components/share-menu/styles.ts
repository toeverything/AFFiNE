import { displayFlex, styled, TextButton } from '../..';

export const StyledShareButton = styled(TextButton)<{ isShared?: boolean }>(
  ({ theme, isShared }) => {
    return {
      padding: '4px 8px',
      marginLeft: '4px',
      marginRight: '16px',
      border: `1px solid ${
        isShared ? theme.colors.primaryColor : theme.colors.iconColor
      }`,
      color: isShared ? theme.colors.primaryColor : theme.colors.iconColor,
      borderRadius: '8px',
      ':hover': {
        border: `1px solid ${theme.colors.primaryColor}`,
      },
      span: {
        ...displayFlex('center', 'center'),
      },
    };
  }
);

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
        ...displayFlex('space-between', 'center'),
        height: '34px',
        color: theme.colors.textColor,
        opacity: isActive ? 1 : 0.2,
        fontWeight: '500',
        fontSize: theme.font.h6,
        lineHeight: theme.font.lineHeight,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        ':after': {
          content: '""',
          position: 'absolute',
          bottom: '-2px',
          left: '-2px',
          width: '100%',
          height: '2px',
          background: theme.colors.textColor,
          opacity: 0.2,
        },
      };
    }
  }
);
export const StyledIndicator = styled('div')<{ activeIndex: number }>(
  ({ theme, activeIndex }) => {
    return {
      height: '2px',
      margin: '0 10px',
      background: theme.colors.textColor,
      position: 'absolute',
      left: `calc(${activeIndex * 100}% / 3)`,
      width: `calc(100% / 3)`,
      transition: 'left .3s, width .3s',
    };
  }
);
export const StyledInput = styled('input')(({ theme }) => {
  return {
    color: theme.colors.placeHolderColor,
    border: `1px solid ${theme.colors.placeHolderColor}`,
    cursor: 'default',
    overflow: 'hidden',
    userSelect: 'text',
    borderRadius: '4px',
  };
});
