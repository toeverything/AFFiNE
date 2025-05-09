import { bodyRegular } from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

import { iconContainer, itemRoot, levelIndent } from '../tree/node.css';

export const wrapper = style([
  itemRoot,
  {
    color: cssVarV2('text/tertiary'),
  },
]);
export const root = style({
  paddingLeft: levelIndent,
});

export const iconWrapper = style([
  iconContainer,
  {
    color: cssVarV2('text/tertiary'),
    fontSize: 24,
  },
]);

export const label = style([bodyRegular]);
