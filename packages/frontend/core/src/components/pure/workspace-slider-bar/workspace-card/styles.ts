import { displayFlex, styled, textEllipsis } from '@affine/component';
import { cssVar } from '@toeverything/theme';
export const StyledSelectorContainer = styled('div')({
  height: '50px',
  display: 'flex',
  alignItems: 'center',
  padding: '0 6px',
  borderRadius: '8px',
  outline: 'none',
  width: 'fit-content',
  maxWidth: '100%',
  color: cssVar('textPrimaryColor'),
  ':hover': {
    cursor: 'pointer',
    background: cssVar('hoverColor'),
  },
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
    fontSize: cssVar('fontSm'),
    lineHeight: '22px',
    fontWeight: 500,
    userSelect: 'none',
    ...textEllipsis(1),
    marginLeft: '4px',
  };
});

export const StyledWorkspaceStatus = styled('div')(() => {
  return {
    height: '22px',
    ...displayFlex('flex-start', 'center'),
    fontSize: cssVar('fontXs'),
    color: cssVar('black50'),
    userSelect: 'none',
    padding: '0 4px',
    gap: '4px',
    zIndex: '1',
    svg: {
      color: cssVar('iconSecondary'),
      '&[data-warning-color="true"]': {
        color: cssVar('errorColor'),
      },
    },
  };
});
