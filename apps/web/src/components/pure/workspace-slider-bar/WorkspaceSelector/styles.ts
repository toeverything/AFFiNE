import { displayFlex, textEllipsis } from '@affine/component';
import { styled } from '@affine/component';
export const StyledSelectorContainer = styled('div')(({ theme }) => {
  return {
    marginTop: '4px',
    height: '58px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 6px',
    marginBottom: '16px',
    borderRadius: '8px',
    color: theme.colors.textColor,
    position: 'relative',
    ':hover': {
      cursor: 'pointer',
      background: theme.colors.hoverBackground,
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
    ...textEllipsis(1),
  };
});

export const StyledWorkspaceStatus = styled('div')(({ theme }) => {
  return {
    height: '22px',
    ...displayFlex('flex-start', 'center'),
    fontSize: theme.font.sm,
    color: theme.colors.secondaryTextColor,
    svg: {
      color: theme.colors.iconColor,
      fontSize: theme.font.base,
      marginRight: '4px',
    },
  };
});
