import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const menuTitleStyle = style({
  marginLeft: '12px',
  marginTop: '10px',
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});
export const menuDividerStyle = style({
  marginTop: '2px',
  marginBottom: '2px',
  marginLeft: '12px',
  marginRight: '8px',
  height: '1px',
  background: cssVar('borderColor'),
});
export const viewMenu = style({});
export const viewOption = style({
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 6,
  width: 24,
  height: 24,
  opacity: 0,
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
  },
  selectors: {
    [`${viewMenu}:hover &`]: {
      opacity: 1,
    },
  },
});
export const filterMenuTrigger = style({
  padding: '6px 8px',
  selectors: {
    [`&[data-is-hidden="true"]`]: {
      display: 'none',
    },
  },
});
