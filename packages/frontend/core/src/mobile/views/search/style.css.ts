import { cssVar } from '@toeverything/theme';
import {
  bodyEmphasized,
  footnoteRegular,
  title3Regular,
} from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const searchHeader = style({
  padding: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
});
export const searchCancel = style({
  height: 44,
  padding: '0px 4px',
  color: cssVarV2.button.primary,
});
export const searchInput = style({
  width: 0,
  flex: 1,
});

export const resTitle = style([
  footnoteRegular,
  {
    padding: '6px 16px',
    marginBottom: 8,
    height: 30,
    color: cssVarV2('text/secondary'),
  },
]);

export const resBlock = style({
  paddingBottom: 32,
  selectors: {
    '&[data-scroll]': {
      paddingBottom: 0,
    },
  },
});
export const resBlockTitle = style([
  bodyEmphasized,
  {
    padding: '0 16px',
    color: cssVarV2('text/primary'),
  },
]);
const resBlockContent = style({
  padding: '12px 0px',
});
export const resBlockListContent = style([
  resBlockContent,
  {
    paddingLeft: 16,
    paddingRight: 16,
  },
]);
export const resBlockScrollContent = style([
  resBlockContent,
  {
    width: '100%',
    overflowX: 'auto',
    paddingBottom: 32,
  },
]);
export const scrollDocsContent = style({
  display: 'flex',
  gap: 12,
  padding: '0 16px',
  width: 'fit-content',
});
export const docCard = style({
  width: 170,
  height: 210,
  flexShrink: 0,
});

export const empty = style([
  title3Regular,
  {
    padding: '0 16px',
    color: cssVarV2('text/primary'),
  },
]);

export const errorMessage = style({
  padding: '0px 16px 16px',
  fontSize: cssVar('fontSm'),
  color: cssVarV2('status/error'),
});
