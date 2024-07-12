import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const icon = style({
  fontSize: 16,
  color: cssVar('iconSecondary'),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const rowNameContainer = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  padding: 6,
  width: '160px',
});

export const rowName = style({
  flexGrow: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
});

export const time = style({
  display: 'flex',
  alignItems: 'center',
  padding: '6px 8px',
  flexGrow: 1,
  fontSize: cssVar('fontSm'),
});

export const rowCell = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'start',
  gap: 4,
});

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  marginTop: 20,
  marginBottom: 4,
});

export const rowValueCell = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  position: 'relative',
  borderRadius: 4,
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  userSelect: 'none',
  ':focus-visible': {
    outline: 'none',
  },
  cursor: 'pointer',
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
  },
  padding: '6px 8px',
  border: `1px solid transparent`,
  color: cssVar('textPrimaryColor'),
  ':focus': {
    backgroundColor: cssVar('hoverColor'),
  },
  '::placeholder': {
    color: cssVar('placeholderColor'),
  },
  selectors: {
    '&[data-empty="true"]': {
      color: cssVar('placeholderColor'),
    },
    '&[data-readonly=true]': {
      pointerEvents: 'none',
    },
  },
  flex: 1,
});

export const tagsMenu = style({
  padding: 0,
  transform:
    'translate(-3.5px, calc(-3.5px + var(--radix-popper-anchor-height) * -1))',
  width: 'calc(var(--radix-popper-anchor-width) + 16px)',
  overflow: 'hidden',
});

export const tagsInlineEditor = style({
  selectors: {
    '&[data-empty=true]': {
      color: cssVar('placeholderColor'),
    },
  },
});
