import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const iconsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const iconsRow = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  color: cssVar('iconColor'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  padding: '0 6px',
  gap: '8px',
  justifyContent: 'space-between',
});

export const iconButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 20,
  borderRadius: '4px',
  width: 28,
  height: 28,
  cursor: 'pointer',
  transition: 'background-color 0.2s',
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
  },
  selectors: {
    '&[data-active=true]': {
      color: cssVar('primaryColor'),
    },
  },
});

export const iconSelectorButton = style({
  fontSize: cssVar('fontH5'),
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  flexShrink: 0,
  border: `1px solid ${cssVar('borderColor')}`,
  background: cssVar('backgroundSecondaryColor'),
  cursor: 'pointer',

  selectors: {
    '&:hover:not([data-readonly=true])': {
      backgroundColor: cssVar('backgroundTertiaryColor'),
    },
    '&[data-readonly=true]': {
      cursor: 'default',
    },
  },
});

export const iconsContainerScrollable = style({
  maxHeight: 320,
  display: 'flex',
  flexDirection: 'column',
});

export const iconsContainerScroller = style({
  transform: 'translateX(4px)',
});

export const menuHeader = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '8px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVar('textSecondaryColor'),
  padding: '8px 12px',
  minWidth: 200,
  textTransform: 'uppercase',
});
