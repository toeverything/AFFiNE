import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const link = style({
  textDecoration: 'none',
  color: cssVarV2('text/link'),
  whiteSpace: 'wrap',
  wordBreak: 'break-all',
  display: 'inline',
});

export const textarea = style({
  border: 'none',
  height: '100%',
  width: '100%',
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  whiteSpace: 'wrap',
  wordBreak: 'break-all',
  padding: `6px`,
  paddingLeft: '5px',
  overflow: 'hidden',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  selectors: {
    '&::placeholder': {
      color: cssVar('placeholderColor'),
    },
  },
});

export const container = style({
  position: 'relative',
  outline: `1px solid transparent`,
  padding: `6px`,
  display: 'block',
  ':focus-within': {
    outline: `1px solid ${cssVar('blue700')}`,
    boxShadow: cssVar('activeShadow'),
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
});

export const textInvisible = style({
  border: 'none',
  whiteSpace: 'wrap',
  wordBreak: 'break-all',
  overflow: 'hidden',
  visibility: 'hidden',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
});
