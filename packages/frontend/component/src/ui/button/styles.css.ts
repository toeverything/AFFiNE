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
export const radioButton = style({
  flexGrow: 1,
  flex: 1,
  selectors: {
    '&:not(:last-of-type)': {
      marginRight: '4px',
    },
  },
});
export const radioButtonContent = style({
  fontSize: cssVar('fontXs'),
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '28px',
  padding: '4px 8px',
  borderRadius: '8px',
  filter: 'drop-shadow(0px 0px 4px rgba(0, 0, 0, 0.1))',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  fontWeight: 600,
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
    },
    '&[data-state="checked"]': {
      background: cssVar('white'),
    },
  },
});
export const radioUncheckedButton = style([
  radioButtonContent,
  {
    color: cssVar('textSecondaryColor'),
    filter: 'none',
    selectors: {
      '[data-state="checked"] > &': {
        display: 'none',
      },
    },
  },
]);
export const radioButtonGroup = style({
  display: 'inline-flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: cssVar('hoverColorFilled'),
  borderRadius: '10px',
  padding: '2px',
  // @ts-expect-error - fix electron drag
  WebkitAppRegion: 'no-drag',
});
