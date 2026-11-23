import { cssVar } from '@toeverything/theme';
import { headlineRegular } from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

// content
export const content = style({
  paddingTop: 8,
});

// trigger
export const triggerRoot = style({
  fontSize: cssVar('fontXs'),
  height: 25,
  width: '100%',
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  borderRadius: 4,
});
export const triggerLabel = style([
  headlineRegular,
  {
    flexGrow: '0',
    display: 'flex',
    gap: 2,
    alignItems: 'center',
    justifyContent: 'start',
    color: cssVarV2('text/primary'),
  },
]);
export const triggerCollapseIcon = style({
  vars: { '--y': '1px', '--r': '90deg' },
  color: cssVarV2('icon/tertiary'),
  transform: 'translateY(var(--y)) rotate(var(--r))',
  transition: 'transform 0.2s',
  selectors: {
    [`${triggerRoot}[data-collapsed="true"] &`]: {
      vars: { '--r': '0deg' },
    },
  },
});
export const triggerActions = style({
  display: 'flex',
  gap: 8,
});
