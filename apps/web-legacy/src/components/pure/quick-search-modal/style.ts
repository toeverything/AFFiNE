import { displayFlex, styled, textEllipsis } from '@affine/component';

export const StyledContent = styled('div')(({ theme }) => {
  return {
    minHeight: '290px',
    maxHeight: '70vh',
    width: '100%',
    overflow: 'auto',
    marginBottom: '10px',
    ...displayFlex('flex-start', 'flex-start'),
    flexDirection: 'column',
    color: theme.colors.textColor,
    transition: 'all 0.15s',
    letterSpacing: '0.06em',
    '[cmdk-group]': {
      width: '100%',
    },
    '[cmdk-group-heading]': {
      ...displayFlex('start', 'center'),
      margin: '0 16px',
      height: '36px',
      lineHeight: '22px',
      fontSize: theme.font.sm,
      color: theme.colors.secondaryTextColor,
    },
    '[cmdk-item]': {
      margin: '0 4px',
    },
    '[aria-selected="true"]': {
      transition: 'all 0.15s',
      borderRadius: '4px',
      color: theme.colors.primaryColor,
      backgroundColor: theme.colors.hoverBackground,
      padding: '0 2px',
    },
  };
});
export const StyledJumpTo = styled('div')(({ theme }) => {
  return {
    ...displayFlex('center', 'start'),
    flexDirection: 'column',
    padding: '10px 10px 10px 0',
    fontSize: theme.font.base,
    strong: {
      fontWeight: '500',
      marginBottom: '10px',
    },
  };
});
export const StyledNotFound = styled('div')(({ theme }) => {
  return {
    width: '612px',
    ...displayFlex('center', 'center'),
    flexDirection: 'column',
    padding: '0 16px',
    fontSize: theme.font.sm,
    lineHeight: '22px',
    color: theme.colors.secondaryTextColor,
    span: {
      ...displayFlex('flex-start', 'center'),
      width: '100%',
      fontWeight: '400',
      height: '36px',
    },

    '>svg': {
      marginTop: '10px',
      height: '200px',
    },
  };
});
export const StyledInputContent = styled('div')(({ theme }) => {
  return {
    ...displayFlex('space-between', 'center'),
    input: {
      width: '492px',
      height: '22px',
      padding: '0 12px',
      fontSize: theme.font.base,
      ...displayFlex('space-between', 'center'),
      letterSpacing: '0.06em',
      color: theme.colors.textColor,
      '::placeholder': {
        color: theme.colors.placeHolderColor,
      },
    },
  };
});
export const StyledShortcut = styled('div')(({ theme }) => {
  return {
    color: theme.colors.placeHolderColor,
    fontSize: theme.font.sm,
    whiteSpace: 'nowrap',
  };
});

export const StyledLabel = styled('label')(({ theme }) => {
  return {
    width: '20px',
    height: '20px',
    color: theme.colors.iconColor,
    fontSize: '20px',
  };
});

export const StyledModalHeader = styled('div')(() => {
  return {
    height: '36px',
    margin: '12px 16px 0px 16px',
    ...displayFlex('space-between', 'center'),
  };
});
export const StyledModalDivider = styled('div')(({ theme }) => {
  return {
    width: 'auto',
    height: '0',
    margin: '6px 16px',
    position: 'relative',
    borderTop: `0.5px solid ${theme.colors.borderColor}`,
    transition: 'all 0.15s',
  };
});

export const StyledModalFooter = styled('div')(({ theme }) => {
  return {
    fontSize: 'inherit',
    lineHeight: '22px',
    marginBottom: '8px',
    textAlign: 'center',
    color: theme.colors.textColor,
    ...displayFlex('center', 'center'),
    transition: 'all .15s',
    '[cmdk-item]': {
      margin: '0 4px',
    },
    '[aria-selected="true"]': {
      transition: 'all 0.15s',
      borderRadius: '4px',
      color: theme.colors.primaryColor,
      backgroundColor: theme.colors.hoverBackground,
      'span,svg': {
        transition: 'all 0.15s',
        transform: 'scale(1.02)',
      },
    },
  };
});
export const StyledModalFooterContent = styled('button')(({ theme }) => {
  return {
    width: '600px',
    height: '32px',
    fontSize: theme.font.base,
    lineHeight: '22px',
    textAlign: 'center',
    ...displayFlex('center', 'center'),
    color: 'inherit',
    borderRadius: '4px',
    transition: 'background .15s, color .15s',
    '>svg': {
      fontSize: '20px',
      marginRight: '12px',
    },
  };
});
export const StyledListItem = styled('button')(({ theme }) => {
  return {
    // width: '612px',
    height: '32px',
    fontSize: 'inherit',
    color: 'inherit',
    padding: '0 12px',
    borderRadius: '4px',
    transition: 'all .15s',
    ...displayFlex('flex-start', 'center'),
    span: {
      ...textEllipsis(1),
    },
    '> svg': {
      fontSize: '20px',
      marginRight: '12px',
    },
  };
});
