import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const dropdownBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  // fix dropdown button click area
  paddingRight: 0,
  color: cssVar('textPrimaryColor'),
  fontWeight: 600,
  background: cssVar('backgroundPrimaryColor'),
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: '8px',
  fontSize: cssVar('fontSm'),
  // width: '100%',
  height: '32px',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      background: cssVar('hoverColorFilled'),
    },
    '&[data-size=default]': {
      height: 32,
    },
    '&[data-size=small]': {
      height: 28,
    },
  },
});

export const divider = style({
  width: '0.5px',
  height: '16px',
  background: cssVar('dividerColor'),
  // fix dropdown button click area
  margin: '0 4px',
  marginRight: 0,
});

export const dropdownWrapper = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingLeft: '4px',
  paddingRight: '10px',
});

export const dropdownIcon = style({
  borderRadius: '4px',
  selectors: {
    [`${dropdownWrapper}:hover &`]: {
      background: cssVar('hoverColor'),
    },
  },
});
