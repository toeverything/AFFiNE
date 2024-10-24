import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const container = style({
  maxWidth: 480,
  minWidth: 360,
  padding: '20px 0',
  alignSelf: 'start',
  marginTop: '120px',
});

export const titleContainer = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
  marginBottom: 20,
  padding: 2,
});

export const titleStyle = style({
  fontSize: cssVar('fontH2'),
  fontWeight: '600',
  minHeight: 42,
  padding: 0,
});

export const rowNameContainer = style({
  display: 'flex',
  flexDirection: 'row',
  gap: 6,
  padding: 6,
  width: '160px',
});

export const viewport = style({
  maxHeight: 'calc(100vh - 220px)',
  padding: '0 24px',
});

export const scrollBar = style({
  width: 6,
  transform: 'translateX(-4px)',
});

export const hiddenInput = style({
  width: '0',
  height: '0',
  position: 'absolute',
});

export const timeRow = style({
  marginTop: 20,
  borderBottom: 4,
});

export const tableBodyRoot = style({
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
});

export const addPropertyButton = style({
  alignSelf: 'flex-start',
  fontSize: cssVar('fontSm'),
  color: `${cssVarV2('text/secondary')}`,
  padding: '0 4px',
  height: 36,
  fontWeight: 400,
  gap: 6,
  '@media': {
    print: {
      display: 'none',
    },
  },
  selectors: {
    [`[data-property-collapsed="true"] &`]: {
      display: 'none',
    },
  },
});
globalStyle(`${addPropertyButton} svg`, {
  fontSize: 16,
  color: cssVarV2('icon/secondary'),
});
globalStyle(`${addPropertyButton}:hover svg`, {
  color: cssVarV2('icon/primary'),
});
