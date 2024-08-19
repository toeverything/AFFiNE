import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
});

export const header = style({
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  minHeight: 64,
});
export const search = style({
  width: '100%',
  height: '100%',
  outline: 'none',
  padding: '20px 20px 20px 24px',

  fontSize: 20,
  lineHeight: '24px',
  fontWeight: 400,
  letterSpacing: -0.2,
});

export const content = style({
  height: 0,
  flex: 1,
});

export const footer = style({
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  minHeight: 64,
  padding: '20px 24px',
  borderBottomLeftRadius: 'inherit',
  borderBottomRightRadius: 'inherit',

  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const footerInfo = style({
  display: 'flex',
  alignItems: 'center',
  gap: 18,

  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  fontWeight: 500,
});

export const selectedCount = style({
  display: 'flex',
  alignItems: 'center',
  gap: 7,
});
export const selectedNum = style({
  color: cssVar('primaryColor'),
});
export const clearButton = style({
  padding: '4px 18px',
});

export const footerAction = style({
  display: 'flex',
  gap: 20,
});
export const actionButton = style({
  padding: '4px 18px',
});
