import { displayFlex, styled, textEllipsis } from '@affine/component';

export const StyledSplitLine = styled('div')(() => {
  return {
    width: '1px',
    height: '20px',
    background: 'var(--affine-border-color)',
    marginRight: '12px',
  };
});

export const StyleWorkspaceInfo = styled('div')(() => {
  return {
    marginLeft: '15px',
    width: '202px',
    p: {
      height: '20px',
      fontSize: 'var(--affine-font-sm)',
      ...displayFlex('flex-start', 'center'),
    },
    svg: {
      marginRight: '10px',
      fontSize: '16px',
      flexShrink: 0,
    },
    span: {
      flexGrow: 1,
      ...textEllipsis(1),
    },
  };
});

export const StyleWorkspaceTitle = styled('div')(() => {
  return {
    fontSize: 'var(--affine-font-base)',
    fontWeight: 600,
    lineHeight: '24px',
    marginBottom: '10px',
    maxWidth: '200px',
    ...textEllipsis(1),
  };
});

export const StyledCreateWorkspaceCard = styled('div')(() => {
  return {
    width: '310px',
    height: '124px',
    marginBottom: '24px',
    cursor: 'pointer',
    padding: '16px',
    boxShadow: 'var(--affine-shadow-1)',
    borderRadius: '12px',
    transition: 'all .1s',
    background: 'var(--affine-white-80)',
    ...displayFlex('flex-start', 'flex-start'),
    color: 'var(--affine-text-secondary-color)',

    ':hover': {
      background: 'var(--affine-hover-color)',
      color: 'var(--affine-text-primary-color)',
      '.add-icon': {
        borderColor: 'var(--affine-white)',
        color: 'var(--affine-primary-color)',
      },
    },
    '@media (max-width: 720px)': {
      width: '100%',
    },
  };
});
export const StyledCreateWorkspaceCardPillContainer = styled('div')(() => {
  return {
    borderRadius: '10px',
    display: 'flex',
    margin: '-8px -4px',
    flexFlow: 'column',
    gap: '12px',
    background: 'var(--affine-background-overlay-panel-color)',
  };
});

export const StyledCreateWorkspaceCardPill = styled('div')(() => {
  return {
    borderRadius: '8px',
    display: 'flex',
    width: '100%',
    height: '58px',
    border: `1px solid var(--affine-border-color)`,
  };
});

export const StyledSignInCardPill = styled('div')(() => {
  return {
    borderRadius: '8px',
    display: 'flex',
    width: '100%',
    height: '58px',
  };
});

export const StyledImportWorkspaceCardPill = styled('div')(() => {
  return {
    borderRadius: '5px',
    display: 'flex',
    width: '100%',
  };
});

export const StyledCreateWorkspaceCardPillContent = styled('div')(() => {
  return {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  };
});

export const StyledCreateWorkspaceCardPillIcon = styled('div')(() => {
  return {
    fontSize: '20px',
    width: '1em',
    height: '1em',
  };
});

export const StyledSignInCardPillTextCotainer = styled('div')(() => {
  return {
    display: 'flex',
    flexDirection: 'column',
  };
});

export const StyledSignInCardPillTextSecondary = styled('div')(() => {
  return {
    fontSize: '12px',
    color: 'var(--affine-text-secondary-color)',
  };
});

export const StyledSignInCardPillTextPrimary = styled('div')(() => {
  return {
    fontSize: 'var(--affine-font-base)',
    fontWeight: 600,
    lineHeight: '24px',
    maxWidth: '200px',
    ...textEllipsis(1),
  };
});

export const StyledModalHeaderLeft = styled('div')(() => {
  return { ...displayFlex('flex-start', 'center') };
});
export const StyledModalTitle = styled('div')(() => {
  return {
    fontWeight: 600,
    fontSize: 'var(--affine-font-h6)',
    color: 'var(--affine-text-primary-color)',
  };
});

export const StyledHelperContainer = styled('div')(() => {
  return {
    color: 'var(--affine-icon-color)',
    marginLeft: '15px',
    fontWeight: 400,
    fontSize: 'var(--affine-font-h6)',
    ...displayFlex('center', 'center'),
  };
});

export const StyledModalContent = styled('div')({
  ...displayFlex('space-between', 'flex-start', 'flex-start'),
  flexWrap: 'wrap',
  flexDirection: 'column',
  width: '100%',
  gap: '4px',
});

export const StyledModalFooterContent = styled('div')({
  ...displayFlex('space-between', 'flex-start', 'flex-start'),
  flexWrap: 'wrap',
  flexDirection: 'column',
  width: '100%',
  marginTop: '12px',
  backgroundColor: 'var(--affine-background-overlay-panel-color)',
});

export const StyledModalHeaderContent = styled('div')({
  ...displayFlex('space-between', 'flex-start', 'flex-start'),
  flexWrap: 'wrap',
  flexDirection: 'column',
  width: '100%',
  backgroundColor: 'var(--affine-background-overlay-panel-color)',
});

export const StyledOperationWrapper = styled('div')(() => {
  return {
    ...displayFlex('flex-end', 'center'),
  };
});

export const StyleWorkspaceAdd = styled('div')(() => {
  return {
    width: '58px',
    height: '58px',
    borderRadius: '100%',
    background: 'var(--affine-background-overlay-panel-color)',
    border: '1.5px dashed #f4f5fa',
    transition: 'background .2s',
    fontSize: '24px',
    ...displayFlex('center', 'center'),
    borderColor: 'var(--affine-white)',
    color: 'var(--affine-background-overlay-panel-color)',
  };
});
export const StyledModalHeader = styled('div')(() => {
  return {
    width: '100%',
    left: 0,
    top: 0,
    borderRadius: '24px 24px 0 0',
    padding: '0px 14px',
    ...displayFlex('space-between', 'center'),
  };
});

export const StyledModalBody = styled('div')(() => {
  return {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
    flex: 1,
    overflowY: 'auto',
  };
});

export const StyledWorkspaceFlavourTitle = styled('div')(() => {
  return {
    fontSize: 'var(--affine-font-xs)',
    color: 'var(--affine-text-secondary-color)',
    marginBottom: '4px',
  };
});
