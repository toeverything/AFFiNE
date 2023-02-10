import {
  displayFlex,
  displayInlineFlex,
  styled,
  textEllipsis,
} from '@affine/component';
import { Button } from '@affine/component';

export const StyledSplitLine = styled.div(({ theme }) => {
  return {
    width: '1px',
    height: '20px',
    background: theme.colors.iconColor,
    marginRight: '24px',
  };
});

export const StyleWorkspaceInfo = styled.div(({ theme }) => {
  return {
    marginLeft: '15px',
    p: {
      height: '20px',
      fontSize: theme.font.xs,
      ...displayFlex('flex-start', 'center'),
    },
    svg: {
      marginRight: '10px',
    },
  };
});

export const StyleWorkspaceTitle = styled.div(({ theme }) => {
  return {
    fontSize: theme.font.base,
    fontWeight: 600,
    lineHeight: '24px',
    marginBottom: '10px',
    maxWidth: '200px',
    ...textEllipsis(1),
  };
});

export const StyledCard = styled.div<{
  active?: boolean;
}>(({ theme, active }) => {
  const borderColor = active ? theme.colors.primaryColor : 'transparent';
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
    ':hover': {
      background: theme.colors.hoverBackground,
      '.add-icon': {
        border: `1.5px dashed ${theme.colors.primaryColor}`,
        svg: {
          fill: theme.colors.primaryColor,
        },
      },
    },
  };
});

export const StyledFooter = styled('div')({
  height: '84px',
  padding: '0 40px',
  ...displayFlex('space-between', 'center'),
});

export const StyleUserInfo = styled.div(({ theme }) => {
  return {
    textAlign: 'left',
    marginLeft: '16px',
    flex: 1,
    p: {
      lineHeight: '24px',
      color: theme.colors.iconColor,
    },
    'p:nth-child(1)': {
      color: theme.colors.textColor,
      fontWeight: 600,
    },
  };
});

export const StyledModalHeaderLeft = styled.div(() => {
  return { ...displayFlex('flex-start', 'center') };
});
export const StyledModalTitle = styled.div(({ theme }) => {
  return {
    fontWeight: 600,
    fontSize: theme.font.h6,
  };
});

export const StyledHelperContainer = styled.div(({ theme }) => {
  return {
    color: theme.colors.iconColor,
    marginLeft: '15px',
    fontWeight: 400,
    ...displayFlex('center', 'center'),
  };
});

export const StyledModalContent = styled('div')({
  height: '534px',
  padding: '8px 40px',
  marginTop: '72px',
  overflow: 'auto',
  ...displayFlex('space-between', 'flex-start', 'flex-start'),
  flexWrap: 'wrap',
});
export const StyledOperationWrapper = styled.div(() => {
  return {
    ...displayFlex('flex-end', 'center'),
  };
});

export const StyleWorkspaceAdd = styled.div(() => {
  return {
    width: '58px',
    height: '58px',
    borderRadius: '100%',
    textAlign: 'center',
    background: '#f4f5fa',
    border: '1.5px dashed #f4f5fa',
    lineHeight: '58px',
    marginTop: '2px',
  };
});
export const StyledModalHeader = styled('div')(({ theme }) => {
  return {
    width: '100%',
    height: '72px',
    position: 'absolute',
    left: 0,
    top: 0,
    background: theme.colors.pageBackground,
    borderRadius: '24px 24px 0 0',
    padding: '0 40px',
    ...displayFlex('space-between', 'center'),
  };
});

export const StyledSignInButton = styled(Button)(({ theme }) => {
  return {
    fontWeight: 700,
    paddingLeft: 0,
    '.circle': {
      width: '40px',
      height: '40px',
      borderRadius: '20px',
      backgroundColor: theme.colors.innerHoverBackground,
      flexShrink: 0,
      marginRight: '16px',
      ...displayInlineFlex('center', 'center'),
    },
  };
});
