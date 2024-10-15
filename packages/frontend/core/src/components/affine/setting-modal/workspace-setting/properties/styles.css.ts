import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const main = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  justifyContent: 'center',
});

export const listHeader = style({
  display: 'flex',
  flexDirection: 'row',
  justifyItems: 'flex-end',
  alignItems: 'center',
  padding: '6px 0',
  marginBottom: 16,
});

export const propertyRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: '6px 0',
  gap: 6,
  outline: 'none',
  transition: 'background 0.2s ease',
  selectors: {
    '&[data-highlight]': {
      background: cssVar('backgroundSecondaryColor'),
    },
  },
});

export const metaList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginBottom: 16,
});

export const propertyIcon = style({
  color: cssVar('iconColor'),
  fontSize: 16,
});

export const propertyName = style({
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontSm'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  selectors: {
    '&[data-unnamed=true]': {
      color: cssVar('placeholderColor'),
    },
  },
});

export const propertyDocCount = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontSm'),
  whiteSpace: 'nowrap',
});

export const divider = style({
  width: '100%',
  height: 0,
  borderTop: `1px solid ${cssVar('borderColor')}`,
});

export const spacer = style({
  flexGrow: 1,
});

export const propertyRequired = style({
  color: cssVar('textDisableColor'),
  fontSize: cssVar('fontXs'),
});

export const subListHeader = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontSm'),
  marginBottom: 8,
});

export const propertyRowNamePopupRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  color: cssVar('textSecondaryColor'),
  padding: '8px 16px',
  minWidth: 260,
});

export const propertyNameIconEditable = style({
  fontSize: cssVar('fontH5'),
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  flexShrink: 0,
  border: `1px solid ${cssVar('borderColor')}`,
  background: cssVar('backgroundSecondaryColor'),
});
