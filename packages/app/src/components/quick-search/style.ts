import { displayFlex, styled } from '@/styles';

export const StyledModalWrapper = styled('div')(({ theme }) => {
  return {
    width: '620px',
    height: 'auto',
    maxHeight: '720px',
    minHeight: '350px',
    backgroundColor: theme.colors.popoverBackground,
    borderRadius: '20px',
    position: 'absolute',
    top: '138px',
    margin: 'auto',
  };
});

export const StyledContent = styled('div')(({ theme }) => {
  return {
    minHeight: '215px',
    maxHeight: '585px',
    width: '100%',
    padding: '0 24px',
    overflow: 'auto',
    color: theme.colors.popoverColor,
    letterSpacing: '0.06em',
  };
});
export const StyledJumpTo = styled('div')(({ theme }) => {
  return {
    ...displayFlex('center', 'start'),
    flexDirection: 'column',
    padding: '10px 10px 10px 0',
    fontSize: theme.font.sm,
    strong: {
      fontWeight: '500',
      marginBottom: '10px',
    },
    a: {
      color: theme.colors.popoverColor,
      padding: '5px 5px 5px 0',
      ...displayFlex('center', 'center'),
      ':visited': {
        color: theme.colors.popoverColor,
      },
      svg: {
        marginBottom: '2px',
      },
      span: {
        marginLeft: '12px',

        lineHeight: '22px',
      },
    },
  };
});
export const StyledInputContent = styled('div')(({ theme }) => {
  return {
    margin: '13px 0',
    ...displayFlex('space-between', 'center'),
    input: {
      width: '492px',
      height: '22px',
      padding: '0 12px',
      fontSize: theme.font.sm,
      ...displayFlex('space-between', 'center'),
      letterSpacing: '0.06em',
      color: theme.colors.popoverColor,
      '::placeholder': {
        color: theme.colors.placeHolderColor,
      },
    },
  };
});
export const StyledShortcut = styled('div')(({ theme }) => {
  return { color: theme.colors.placeHolderColor, fontSize: theme.font.xs };
});
export const StyledInput = styled('input')(({ theme }) => {
  return {};
});
export const StyledLabel = styled('label')(({ theme }) => {
  return {
    width: '24px',
    height: '24px',
    color: theme.colors.iconColor,
  };
});

export const StyledModalHeader = styled('div')(({ theme }) => {
  return {
    height: '48px',
    margin: '12px 24px 0px 24px',
    ...displayFlex('space-between', 'center'),
    color: theme.colors.popoverColor,
  };
});
export const StyledModalDivider = styled('div')(({ theme }) => {
  return {
    width: 'auto',
    height: '0',
    margin: '6px 12px 6.5px 12px',
    position: 'relative',
    borderTop: `0.5px solid ${theme.colors.placeHolderColor}`,
  };
});

export const StyledModalFooter = styled('div')(({ theme }) => {
  return {
    fontSize: theme.font.sm,
    lineHeight: '20px',
    textAlign: 'center',
    color: theme.colors.popoverColor,
    margin: '16px 0',
  };
});
export const StyledModalFooterContent = styled('div')(({ theme }) => {
  return {
    fontSize: theme.font.sm,
    lineHeight: '20px',
    textAlign: 'center',
    ...displayFlex('center', 'center'),
    color: theme.colors.popoverColor,
    margin: '16px 0',
    span: {
      marginLeft: '12px',
    },
  };
});
