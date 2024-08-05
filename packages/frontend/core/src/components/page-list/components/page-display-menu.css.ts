import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const menu = style({
  minWidth: '220px',
});

export const headerDisplayButton = style({
  marginLeft: '16px',
  ['WebkitAppRegion' as string]: 'no-drag',
});

export const subMenuTrigger = style({
  paddingRight: '8px',
});

export const subMenuItem = style({
  fontSize: cssVar('fontXs'),
  flexWrap: 'nowrap',
  selectors: {
    '&[data-active="true"]': {
      color: cssVar('primaryColor'),
    },
  },
});

export const subMenuTriggerContent = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  fontWeight: 500,
  fontSize: cssVar('fontXs'),
});

export const currentGroupType = style({
  fontWeight: 400,
  color: cssVar('textSecondaryColor'),
});

export const listOption = style({
  padding: '4px 12px',
  height: '28px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVar('textSecondaryColor'),
  marginBottom: '4px',
});
export const properties = style({
  padding: '4px 12px',
  height: '28px',
  fontSize: cssVar('fontXs'),
});
export const propertiesWrapper = style({
  display: 'flex',
  flexWrap: 'wrap',
  maxWidth: '200px',
  gap: '8px',
  padding: '4px 12px',
});

export const propertyButton = style({
  color: cssVar('textDisableColor'),
  selectors: {
    '&[data-active="true"]': {
      color: cssVar('textPrimaryColor'),
    },
  },
});
