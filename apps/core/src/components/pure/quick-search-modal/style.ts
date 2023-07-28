import { displayFlex, styled, textEllipsis } from '@affine/component';

export const StyledContent = styled('div')(() => {
  return {
    minHeight: '290px',
    maxHeight: '70vh',
    width: '100%',
    overflow: 'auto',
    marginBottom: '10px',
    ...displayFlex('flex-start', 'flex-start'),
    flexDirection: 'column',
    color: 'var(--affine-text-primary-color)',
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
      fontSize: 'var(--affine-font-sm)',
      color: 'var(--affine-text-secondary-color)',
    },
    '[cmdk-item]': {
      margin: '0 4px',
    },
    '[aria-selected="true"]': {
      transition: 'all 0.15s',
      borderRadius: '4px',
      color: 'var(--affine-primary-color)',
      backgroundColor: 'var(--affine-hover-color)',
      padding: '0 2px',
    },
  };
});
export const StyledJumpTo = styled('div')(() => {
  return {
    ...displayFlex('center', 'start'),
    flexDirection: 'column',
    padding: '10px 10px 10px 0',
    fontSize: 'var(--affine-font-base)',
    strong: {
      fontWeight: '500',
      marginBottom: '10px',
    },
  };
});
export const StyledNotFound = styled('div')(() => {
  return {
    width: '612px',
    ...displayFlex('center', 'center'),
    flexDirection: 'column',
    padding: '0 16px',
    fontSize: 'var(--affine-font-sm)',
    lineHeight: '22px',
    color: 'var(--affine-text-secondary-color)',
    span: {
      ...displayFlex('flex-start', 'center'),
      width: '100%',
      fontWeight: '400',
      height: '36px',
    },

    img: {
      marginTop: '10px',
    },
  };
});
export const StyledInputContent = styled('div')(() => {
  return {
    ...displayFlex('space-between', 'center'),
    input: {
      width: '492px',
      height: '22px',
      padding: '0 12px',
      fontSize: 'var(--affine-font-base)',
      ...displayFlex('space-between', 'center'),
      letterSpacing: '0.06em',
      color: 'var(--affine-text-primary-color)',
      '::placeholder': {
        color: 'var(--affine-placeholder-color)',
      },
    },
  };
});
export const StyledShortcut = styled('div')(() => {
  return {
    color: 'var(--affine-placeholder-color)',
    fontSize: 'var(--affine-font-sm)',
    whiteSpace: 'nowrap',
  };
});

export const StyledLabel = styled('label')(() => {
  return {
    width: '20px',
    height: '20px',
    color: 'var(--affine-icon-color)',
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
export const StyledModalDivider = styled('div')(() => {
  return {
    width: 'auto',
    height: '0',
    margin: '6px 16px',
    borderTop: '0.5px solid var(--affine-border-color)',
  };
});

export const StyledModalFooter = styled('div')(() => {
  return {
    fontSize: 'inherit',
    lineHeight: '22px',
    marginBottom: '8px',
    textAlign: 'center',
    color: 'var(--affine-text-primary-color)',
    ...displayFlex('center', 'center'),
    transition: 'all .15s',
    '[cmdk-item]': {
      margin: '0 4px',
    },
    '[aria-selected="true"]': {
      transition: 'all 0.15s',
      borderRadius: '4px',
      color: 'var(--affine-primary-color)',
      backgroundColor: 'var(--affine-hover-color)',
      'span,svg': {
        transition: 'all 0.15s',
        transform: 'scale(1.02)',
      },
    },
  };
});
export const StyledModalFooterContent = styled('button')(() => {
  return {
    width: '600px',
    height: '32px',
    fontSize: 'var(--affine-font-base)',
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
export const StyledListItem = styled('button')(() => {
  return {
    width: '100%',
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
