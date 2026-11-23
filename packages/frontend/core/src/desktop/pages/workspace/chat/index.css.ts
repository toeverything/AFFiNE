import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const chatTabsContainer = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
});

export const chatRoot = style({
  width: '100%',
  flex: 1,
  minHeight: 0,
});

export const chatHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  gap: 12,
  borderBottom: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
});
