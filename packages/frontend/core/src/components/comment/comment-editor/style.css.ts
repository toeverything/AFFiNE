import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const container = style({
  width: '100%',
  height: '100%',
  border: `1px solid transparent`,
  selectors: {
    '&[data-readonly="false"]': {
      borderColor: cssVarV2('layer/insideBorder/border'),
      borderRadius: 16,
      padding: '0 8px',
    },
    '&[data-readonly="false"]:focus-within': {
      borderColor: cssVarV2('layer/insideBorder/primaryBorder'),
      boxShadow: cssVar('activeShadow'),
    },
  },
  vars: {
    '--affine-paragraph-margin': '0',
    '--affine-font-base': '14px',
  },
});

export const footer = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  paddingBottom: 8,
});

globalStyle(`${container} .affine-page-root-block-container`, {
  padding: '8px 0',
  minHeight: '32px',
});

globalStyle(`${container} .affine-paragraph-rich-text-wrapper`, {
  margin: 0,
});

export const commitButton = style({
  background: cssVarV2('button/primary'),
  border: 'none',
  cursor: 'pointer',
  color: cssVarV2('layer/pureWhite'),
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  fontSize: 20,
  selectors: {
    '&[data-disabled="true"]': {
      background: cssVarV2('button/disable'),
      cursor: 'default',
    },
  },
});
