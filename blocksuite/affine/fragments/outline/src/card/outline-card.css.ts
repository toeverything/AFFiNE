import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const outlineCard = style({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxSizing: 'border-box',

  selectors: {
    '&[data-status="dragging"]': {
      pointerEvents: 'none',
      opacity: 0.5,
    },
    '&[data-sortable="true"]': {
      padding: '2px 0px',
    },
  },
});

export const cardPreview = style({
  position: 'relative',
  width: '100%',
  borderRadius: '4px',
  cursor: 'default',
  userSelect: 'none',
  selectors: {
    [`${outlineCard}[data-sortable="true"] &:hover`]: {
      background: cssVarV2('layer/background/hoverOverlay'),
    },
    [`${outlineCard}[data-status="selected"] &`]: {
      background: cssVarV2('layer/background/hoverOverlay'),
    },
    [`${outlineCard}[data-status="dragging"] &`]: {
      background: cssVarV2('layer/background/hoverOverlay'),
      opacity: 0.9,
    },
  },
});

export const cardHeader = style({
  padding: '0 8px',
  width: '100%',
  minHeight: '28px',
  display: 'none',
  alignItems: 'center',
  gap: '8px',
  boxSizing: 'border-box',

  ':hover': {
    cursor: 'grab',
  },
  selectors: {
    [`${outlineCard}[data-sortable="true"] &`]: {
      display: 'flex',
    },
    [`${outlineCard}[data-visibility="edgeless"] &:hover`]: {
      cursor: 'default',
    },
  },
});

const invisibleCard = style({
  selectors: {
    [`${outlineCard}[data-visibility="edgeless"] &`]: {
      color: cssVarV2('text/disable'),
      pointerEvents: 'none',
    },
  },
});

export const headerIcon = style([
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invisibleCard,
]);

export const headerNumber = style([
  {
    textAlign: 'center',
    fontSize: cssVar('fontSm'),
    color: cssVar('brandColor'),
    fontWeight: 500,
    lineHeight: '14px',
  },
  invisibleCard,
]);

export const divider = style({
  height: '1px',
  flex: 1,
  borderTop: `1px dashed ${cssVar('borderColor')}`,
  transform: 'translateY(50%)',
});

export const displayModeButtonGroup = style({
  display: 'none',
  position: 'absolute',
  right: '8px',
  top: '-6px',
  paddingTop: '8px',
  paddingBottom: '8px',
  alignItems: 'center',
  gap: '4px',
  fontSize: '12px',
  fontWeight: 500,
  lineHeight: '20px',

  selectors: {
    [`${cardPreview}:hover &`]: {
      display: 'flex',
    },
  },
});

export const displayModeButton = style({
  display: 'flex',
  borderRadius: '4px',
  backgroundColor: cssVar('hoverColor'),
  alignItems: 'center',
});

export const currentModeLabel = style({
  display: 'flex',
  padding: '2px 0px 2px 4px',
  alignItems: 'center',
});

export const cardContent = style([
  {
    fontFamily: cssVar('fontSansFamily'),
    userSelect: 'none',
    color: cssVarV2('text/primary'),

    ':hover': {
      cursor: 'pointer',
    },
  },
  invisibleCard,
]);

export const modeChangePanel = style({
  position: 'absolute',
  display: 'none',
  background: cssVarV2('layer/background/overlayPanel'),
  borderRadius: '8px',
  boxShadow: cssVar('shadow2'),
  boxSizing: 'border-box',
  padding: '8px',
  fontSize: cssVar('fontSm'),
  color: cssVarV2('text/primary'),
  lineHeight: '22px',
  fontWeight: 400,
  fontFamily: cssVar('fontSansFamily'),

  selectors: {
    '&[data-show]': {
      display: 'flex',
    },
  },
});
