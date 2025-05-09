import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { keyframes, style } from '@vanilla-extract/css';

const tooltipScaleIn = keyframes({
  from: {
    opacity: 0,
    transform: 'scale(0.85)',
  },
  to: {
    opacity: 1,
    transform: 'scale(1)',
  },
});

export const tooltipContent = style({
  backgroundColor: cssVarV2('tooltips/background'),
  color: cssVarV2('tooltips/foreground'),
  padding: '5px 12px',
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  borderRadius: '4px',
  maxWidth: '280px',
  wordBreak: 'break-word',
  transformOrigin: 'var(--radix-tooltip-content-transform-origin)',
  animation: `${tooltipScaleIn} 0.2s cubic-bezier(0.2, 1, 0.3, 1)`,
});

export const withShortcut = style({
  display: 'flex',
  gap: 10,
});
export const withShortcutContent = style({
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
});

export const shortcut = style({
  display: 'flex',
  alignItems: 'center',
  gap: 2,
});
export const command = style({
  background: cssVarV2('tooltips/secondaryBackground'),
  fontSize: cssVar('fontXs'),
  fontWeight: 400,
  lineHeight: '20px',
  height: 16,
  minWidth: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 4px',
  borderRadius: 4,
  selectors: {
    '&[data-length="1"]': {
      width: 16,
    },
  },
});
