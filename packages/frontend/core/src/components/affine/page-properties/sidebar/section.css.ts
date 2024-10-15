import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const headerRoot = style({
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  boxSizing: 'border-box',
  padding: '8px 16px',
});

export const headerTitle = style({
  height: '22px',
  fontSize: '14px',
  fontWeight: '500',
  lineHeight: '22px',
  color: cssVarV2('text/primary'),
});

export const collapseIcon = style({
  vars: { '--y': '1px', '--r': '90deg' },
  color: cssVarV2('icon/secondary'),
  transform: 'translateY(var(--y)) rotate(var(--r))',
  transition: 'transform 0.2s',
  selectors: {
    [`button[data-state="closed"] &`]: {
      vars: { '--r': '0deg' },
    },
  },
});
