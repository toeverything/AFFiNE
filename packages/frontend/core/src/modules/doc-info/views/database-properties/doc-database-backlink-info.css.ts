import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const cell = style({
  display: 'flex',
  gap: 4,
});

export const divider = style({
  margin: '8px 0',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: 4,
});

export const headerTrigger = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flex: 1,
});

export const headerIcon = style({
  width: 16,
  height: 16,
  color: cssVarV2('icon/primary'),
});

export const headerName = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
});

export const spacer = style({
  flex: 1,
});

export const content = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  selectors: {
    '&[hidden]': {
      display: 'none',
    },
  },
});

export const collapseButtonWrapper = style({
  display: 'flex',
  flex: 1,
  justifyContent: 'flex-end',
  cursor: 'pointer',
});

export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(90deg)',
    },
  },
});

export const docRefLink = style({
  maxWidth: '50%',
  fontSize: cssVar('fontSm'),
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: cssVarV2('text/tertiary'),
});

globalStyle(`${docRefLink} .affine-reference-title`, {
  border: 'none',
});
