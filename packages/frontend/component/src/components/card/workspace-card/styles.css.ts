import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

import { displayFlex, textEllipsis } from '../../../styles';

export const card = style({
  width: '100%',
  cursor: 'pointer',
  padding: '8px 12px',
  borderRadius: 4,
  // border: `1px solid ${borderColor}`,
  boxShadow: 'inset 0 0 0 1px transparent',
  ...displayFlex('flex-start', 'flex-start'),
  transition: 'background .2s',
  position: 'relative',
  color: cssVar('textSecondaryColor'),
  background: 'transparent',
  display: 'flex',
  alignItems: 'center',
  gap: 12,

  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
    },
    '&[data-active="true"]': {
      boxShadow: 'inset 0 0 0 1px ' + cssVar('brandColor'),
    },
  },
});

export const workspaceInfo = style({
  width: 0,
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 2,
});

export const workspaceTitle = style({
  width: 0,
  flex: 1,
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  lineHeight: '22px',
  maxWidth: '190px',
  color: cssVar('textPrimaryColor'),
  ...textEllipsis(1),
});

export const actionButtons = style({
  display: 'flex',
  alignItems: 'center',
});

export const settingButtonWrapper = style({});

export const settingButton = style({
  transition: 'all 0.13s ease',
  width: 0,
  height: 20,
  overflow: 'hidden',
  marginLeft: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  placeItems: 'center',

  borderRadius: 4,
  boxShadow: 'none',
  background: 'transparent',
  cursor: 'pointer',

  selectors: {
    [`.${card}:hover &`]: {
      width: 20,
      marginLeft: 8,
      boxShadow: cssVar('shadow1'),
      background: cssVar('white80'),
    },
  },
});

export const showOnCardHover = style({
  visibility: 'hidden',
  opacity: 0,
  selectors: {
    [`.${card}:hover &`]: {
      visibility: 'visible',
      opacity: 1,
    },
  },
});
