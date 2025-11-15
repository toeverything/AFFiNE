import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const textarea = style({
  border: 'none',
  height: '100%',
  width: '100%',
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  whiteSpace: 'break-spaces',
  wordBreak: 'break-word',
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

export const mobileTextareaWrapper = style({
  position: 'relative',
  background: cssVarV2('layer/background/primary'),
  borderRadius: 12,
});

const mobileTextareaBase = {
  fontSize: 17,
  lineHeight: '26px',
  padding: 12,
};

export const mobileTextareaPlain = style([
  textarea,
  mobileTextareaBase,
  {
    position: 'relative',
    fontSize: 14,
    lineHeight: '22px',
    height: 'auto',
    padding: 0,
  },
]);

export const mobileTextarea = style([textarea, mobileTextareaBase]);

export const textPropertyValueContainer = style({
  outline: `1px solid transparent`,
  padding: `6px`,
  ':focus-within': {
    outline: `1px solid ${cssVar('blue700')}`,
    boxShadow: cssVar('activeShadow'),
    backgroundColor: cssVarV2('layer/background/hoverOverlay'),
  },
});

export const textInvisible = style({
  border: 'none',
  whiteSpace: 'break-spaces',
  wordBreak: 'break-word',
  overflow: 'hidden',
  visibility: 'hidden',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
});

export const mobileTextInvisible = style([textInvisible, mobileTextareaBase]);
