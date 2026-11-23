import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const filterTypeStyle = style({
  fontSize: cssVar('fontSm'),
  display: 'flex',
  alignItems: 'center',
  padding: '0px 4px 0 0',
  lineHeight: '22px',
  color: cssVar('textPrimaryColor'),
});

export const filterValueStyle = style({
  fontSize: cssVar('fontSm'),
  display: 'flex',
  alignItems: 'center',
  padding: '0px 4px',
  lineHeight: '22px',
  height: '22px',
  color: cssVar('textPrimaryColor'),
  selectors: {
    '&:has(>:hover)': {
      cursor: 'pointer',
      background: cssVar('hoverColor'),
      borderRadius: '4px',
    },
    '&:empty': {
      display: 'none',
    },
  },
});

export const filterValueEmptyStyle = style({
  color: cssVarV2('text/placeholder'),
});

export const ellipsisTextStyle = style({
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
});

export const filterTypeIconStyle = style({
  fontSize: '18px',
  marginRight: '6px',
  padding: '1px 0',
  display: 'flex',
  alignItems: 'center',
  color: cssVar('iconColor'),
});

export const filterTypeIconUnknownStyle = style({
  color: cssVarV2('status/error'),
});

export const filterTypeUnknownNameStyle = style({
  color: cssVarV2('text/disable'),
});

export const switchStyle = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
  padding: '0px 4px',
  lineHeight: '22px',
  transition: 'background 0.15s ease-in-out',
  display: 'flex',
  alignItems: 'center',
  minWidth: '18px',
  ':hover': {
    cursor: 'pointer',
    background: cssVar('hoverColor'),
    borderRadius: '4px',
  },
});
