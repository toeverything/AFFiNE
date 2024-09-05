import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

const headerContentHeight = 56;
const headerPaddingTop = 16;

const basicHeader = style({
  width: '100%',
  height: headerContentHeight + headerPaddingTop,
});
export const header = style([
  basicHeader,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: `${headerPaddingTop}px 16px 0px 16px`,

    position: 'fixed',
    top: 0,
    backgroundColor: cssVarV2('layer/background/secondary'),
    zIndex: 1,
  },
]);
export const headerSpace = style([basicHeader]);

export const tabs = style({
  height: headerContentHeight,
  gap: 16,
  display: 'flex',
  alignItems: 'center',
});
export const tab = style({
  fontSize: 20,
  fontWeight: 600,
  lineHeight: '28px',
  color: cssVarV2('text/tertiary'),
  selectors: {
    '&[data-active="true"]': {
      color: cssVarV2('text/primary'),
    },
  },
});
