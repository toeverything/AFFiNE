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
        ...displayFlex('center', 'center'),
        flex: '1',
        height: '30px',
        color: theme.colors.textColor,
        opacity: isActive ? 1 : 0.2,
        fontWeight: '500',
        fontSize: theme.font.base,
        lineHeight: theme.font.lineHeight,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        padding: '0 10px',
        marginBottom: '4px',
        borderRadius: '4px',
        ':hover': {
          background: theme.colors.hoverBackground,
          opacity: 1,
          color: isActive
            ? theme.colors.textColor
            : theme.colors.secondaryTextColor,
          svg: {
            fill: isActive
              ? theme.colors.textColor
              : theme.colors.secondaryTextColor,
          },
        },
        svg: {
          fontSize: '20px',
          marginRight: '12px',
        },
        ':after': {
          content: '""',
          position: 'absolute',
          bottom: '-2px',
          left: '0',
          width: '100%',
          height: '2px',
          background: theme.colors.textColor,
          opacity: 0.2,
        },
      };
    }
  }
);
export const StyledIndicator = styled('div')(({ theme }) => {
  return {
    height: '2px',
    background: theme.colors.textColor,
    position: 'absolute',
    left: '0',
    transition: 'left .3s, width .3s',
  };
});
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
