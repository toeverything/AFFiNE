import { bodyRegular } from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

const basicHeader = style({
  width: '100%',
  height: 44,
});
export const header = style({
  width: '100%',
  position: 'fixed',
  top: 0,
  backgroundColor: cssVarV2('layer/background/mobile/primary'),
  zIndex: 1,
  borderBottom: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
});
export const headerSpace = style([basicHeader]);
export const headerContent = style([
  basicHeader,
  {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: `0px 16px`,
  },
]);

export const tabs = style({
  height: 44,
  gap: 20,
  display: 'flex',
  alignItems: 'center',
});
export const tab = style([
  bodyRegular,
  {
    position: 'relative',
    height: 44,
    display: 'flex',
    alignItems: 'center',
    color: cssVarV2('tab/fontColor/default'),
    selectors: {
      '&[data-active="true"]': {
        fontWeight: 600,
        color: cssVarV2('tab/fontColor/active'),
      },
      '&[data-active="true"]::after': {
        content: '""',
        position: 'absolute',
        right: 0,
        bottom: 0,
        left: 0,
        height: 2,
        background: cssVarV2('tab/divider/indicator'),
      },
    },
  },
]);
