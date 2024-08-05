import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const iconWrapper = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: '24px',
  cursor: 'pointer',
  color: cssVar('textPrimaryColor'),
  selectors: {
    '&:visited': {
      color: cssVar('textPrimaryColor'),
    },
  },
});
export const rightItemContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '0 8px',
});

export const headerDivider = style({
  width: '1px',
  height: '20px',
  background: cssVar('borderColor'),
  display: 'none',
  selectors: {
    '&[data-is-member="true"]': {
      display: 'block',
    },
    '&[data-is-edgeless="true"]': {
      display: 'block',
    },
  },
  '@media': {
    'screen and (max-width: 640px)': {
      selectors: {
        '&[data-is-member="false"][data-is-edgeless="true"]': {
          display: 'none',
        },
      },
    },
  },
});

export const presentButton = style({
  background: cssVar('black'),
  color: cssVar('white'),
  borderColor: cssVar('pureBlack10'),
  boxShadow: cssVar('buttonInnerShadow'),

  '@media': {
    'screen and (max-width: 640px)': {
      display: 'none',
    },
  },
});

globalStyle(`${presentButton} svg`, {
  color: cssVar('white'),
});

export const editButton = style({
  padding: '4px 8px',
});

export const userPlanButton = style({
  display: 'flex',
  fontSize: cssVar('fontXs'),
  height: 20,
  fontWeight: 500,
  color: cssVar('pureWhite'),
  backgroundColor: cssVar('brandColor'),
  padding: '0 4px',
  borderRadius: 4,
  justifyContent: 'center',
  alignItems: 'center',
});

export const accountCard = style({
  padding: '4px 8px',
  borderRadius: '8px',
  userSelect: 'none',
  display: 'flex',
  columnGap: '10px',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const avatar = style({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  fontSize: '20px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexShrink: 0,
});

export const content = style({
  flexGrow: '1',
  minWidth: 0,
});

export const nameContainer = style({
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  width: '100%',
  gap: '4px',
  height: '22px',
});
export const userName = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  height: '22px',
});

export const userEmail = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexGrow: 1,
  height: '20px',
});
