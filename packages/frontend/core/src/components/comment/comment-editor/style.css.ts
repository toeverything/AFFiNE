import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const container = style({
  width: '100%',
  height: '100%',
  border: `1px solid transparent`,
  overflow: 'hidden',
  selectors: {
    '&[data-readonly="false"]': {
      borderColor: cssVarV2('layer/insideBorder/border'),
      background: cssVarV2('layer/background/primary'),
      borderRadius: 16,
      padding: '0 8px',
    },
    '&[data-readonly="false"]:is(:focus-within, :active)': {
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
    '&[disabled]': {
      background: cssVarV2('button/disable'),
      cursor: 'default',
    },
    '&:hover': {
      opacity: 0.8,
    },
  },
});

export const previewRow = style({
  display: 'flex',
  gap: 4,
  padding: '8px 0',
  flexWrap: 'nowrap',
  overflowX: 'auto',
});

export const previewBox = style({
  position: 'relative',
  width: 62,
  height: 62,
  aspectRatio: '1/1',
  objectFit: 'cover',
  borderRadius: 4,
  flex: '0 0 auto',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      opacity: 0.8,
    },
  },
});

export const attachmentButton = style({
  position: 'absolute',
  top: -6,
  right: -6,
  background: cssVarV2('layer/background/primary'),
  border: '1px solid',
  borderColor: cssVarV2('layer/insideBorder/border'),
  selectors: {
    '&:hover': {
      background: cssVarV2('layer/background/error'),
      borderColor: cssVarV2('button/error'),
      color: cssVarV2('button/error'),
    },
  },
});

// New generic file preview box (non-image attachments)
export const filePreviewBox = style({
  position: 'relative',
  width: 194,
  height: 62,
  borderRadius: 4,
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 4px',
  background: cssVarV2('layer/background/secondary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      opacity: 0.8,
    },
  },
});

export const fileIcon = style({
  height: 36,
  width: 'auto',
});

export const fileInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  overflow: 'hidden',
});

export const fileName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 14,
  flex: '1 1 auto',
  fontWeight: 600,
});

export const fileSize = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
});

export const deleteBtn = style({
  position: 'absolute',
  top: -6,
  right: -6,
  width: 16,
  height: 16,
  borderRadius: '50%',
  background: cssVarV2('layer/background/primary'),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  selectors: {
    '&:hover': {
      background: cssVarV2('layer/background/error'),
      borderColor: cssVarV2('button/error'),
    },
  },
});

export const spinnerWrapper = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: cssVarV2('layer/background/tertiary'),
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
