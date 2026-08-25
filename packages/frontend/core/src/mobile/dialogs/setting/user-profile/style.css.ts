import {
  bodyRegular,
  subHeadlineRegular,
} from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const profile = style({
  display: 'flex',
  alignItems: 'center',
  gap: 13,
});

export const avatarWrapper = style({
  width: 48,
  height: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const content = style({
  width: 0,
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

const ellipsis = style({
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
});

export const title = style([
  bodyRegular,
  {
    color: cssVarV2('text/primary'),
    fontSize: 19,
    lineHeight: '24px',
  },
]);

export const caption = style([
  subHeadlineRegular,
  {
    color: cssVarV2('text/secondary'),
    fontSize: 16,
    lineHeight: '20px',
  },
]);

export const suffixIcon = style({
  fontSize: 20,
  color: cssVarV2('icon/secondary'),
});

export const emailInfo = style([ellipsis, { width: '100%' }]);
export const nameWithTag = style({
  display: 'flex',
  gap: 8,
});
export const name = style([ellipsis]);
