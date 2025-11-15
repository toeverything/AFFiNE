import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const outlineBlockPreview = style({
  fontFamily: cssVar('fontFamily'),
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  whiteSpace: 'nowrap',
  display: 'flex',
  justifyContent: 'start',
  alignItems: 'center',
  gap: '8px',

  ':hover': {
    cursor: 'pointer',
    background: cssVarV2('layer/background/hoverOverlay'),
  },

  selectors: {
    '.active > &': {
      color: cssVarV2('text/emphasis'),
    },
    '&:not(:has(span))': {
      display: 'none',
    },
  },
});

export const icon = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '22px',
  height: '22px',
  boxSizing: 'border-box',
  padding: '4px',
  background: cssVarV2('layer/background/secondary'),
  borderRadius: '4px',
  color: cssVarV2('icon/primary'),
});

export const iconDisabled = style({
  color: cssVarV2('icon/disable'),
});

export const text = style({
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flex: 1,
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  height: '22px',
});

export const textGeneral = style({
  fontWeight: 400,
  paddingLeft: '28px',
});

export const subtypeStyles = {
  title: style({
    fontWeight: 600,
    paddingLeft: '0',
  }),
  h1: style({
    fontWeight: 600,
    paddingLeft: '0',
  }),
  h2: style({
    fontWeight: 600,
    paddingLeft: '4px',
  }),
  h3: style({
    fontWeight: 600,
    paddingLeft: '12px',
  }),
  h4: style({
    fontWeight: 600,
    paddingLeft: '16px',
  }),
  h5: style({
    fontWeight: 600,
    paddingLeft: '20px',
  }),
  h6: style({
    fontWeight: 600,
    paddingLeft: '24px',
  }),
};

export const textSpan = style({
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const linkedDocText = style({
  fontSize: 'inherit',
  borderBottom: `0.5px solid ${cssVar('dividerColor')}`,
  whiteSpace: 'break-spaces',
  marginRight: '2px',
});

export const linkedDocPreviewUnavailable = style({
  color: cssVarV2('text/disable'),
});

export const linkedDocPreviewAvailable = style({});
globalStyle(`${linkedDocPreviewAvailable} > svg`, {
  marginBottom: '0.1em',
});

export const linkedDocTextUnavailable = style({
  color: cssVarV2('text/disable'),
  textDecoration: 'line-through',
});
