import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const member = style({
  height: '22px',
  display: 'flex',
  minWidth: 0,
  alignItems: 'center',
  justifyContent: 'space-between',
  ':last-child': {
    minWidth: 'max-content',
  },
});

export const memberInnerWrapper = style({
  fontSize: 'inherit',
  borderRadius: '2px',
  columnGap: '4px',
  borderWidth: '1px',
  borderStyle: 'solid',
  background: cssVar('backgroundPrimaryColor'),
  maxWidth: '128px',
  height: '100%',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '1px 2px',
  color: cssVarV2('text/primary'),
  borderColor: cssVarV2('layer/insideBorder/blackBorder'),
});

export const label = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  userSelect: 'none',
});

export const remove = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  borderRadius: '2px',
  flexShrink: 0,
  cursor: 'pointer',
  ':hover': {
    background: 'var(--affine-hover-color)',
  },
});
