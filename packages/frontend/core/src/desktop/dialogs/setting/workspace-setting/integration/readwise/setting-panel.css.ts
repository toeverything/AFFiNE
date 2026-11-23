import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const dialog = style({
  width: 480,
  maxWidth: 'calc(100vw - 32px)',
});

export const connectButton = style({
  width: '100%',
  color: cssVarV2.text.secondary,
});

export const settings = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'stretch',
});

export const divider = style({
  height: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'stretch',
  selectors: {
    '&::before': {
      content: '',
      width: '100%',
      height: 0,
      borderBottom: `0.5px solid ${cssVarV2.layer.insideBorder.border}`,
      flexGrow: 1,
    },
  },
});

export const updateStrategyLabel = style({
  fontSize: 12,
  fontWeight: 500,
  lineHeight: '20px',
  color: cssVarV2.text.primary,
  marginBottom: 8,
});
export const updateStrategyGroup = style({
  overflow: 'hidden',
  display: 'grid',
  gridTemplateRows: '1fr',
  transition:
    'grid-template-rows 0.4s cubic-bezier(.07,.83,.46,1), opacity 0.4s ease',
  selectors: {
    '&[data-collapsed="true"]': {
      gridTemplateRows: '0fr',
      opacity: 0,
    },
  },
});
export const updateStrategyGroupContent = style({
  overflow: 'hidden',
});

export const tagsLabel = style({
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '22px',
  color: cssVarV2.text.primary,
  marginBottom: 2,
});

export const tagsEditor = style({
  padding: '6px 8px',
  borderRadius: 4,
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  fontSize: 14,
});
export const tagsPlaceholder = style({
  fontSize: 14,
  lineHeight: '22px',
  color: cssVarV2.text.placeholder,
});
export const tagsMenu = style({
  left: -1,
  top: 'calc(-1px + var(--radix-popper-anchor-height) * -1)',
  width: 'calc(2px + var(--radix-popper-anchor-width))',
});
