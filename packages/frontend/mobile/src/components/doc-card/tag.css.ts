import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

export const tagColorVar = createVar();

export const tags = style({
  width: '100%',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  position: 'relative',
  gap: 4,
});

export const tag = style({
  padding: '0px 8px',
  borderRadius: 10,
  alignItems: 'center',
  border: `1px solid ${cssVarV2('layer/insideBorder/blackBorder')}`,
  maxWidth: '100%',

  fontSize: 12,
  lineHeight: '20px',
  fontWeight: 400,

  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',

  ':before': {
    content: "''",
    display: 'inline-block',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tagColorVar,
    marginRight: 4,
  },
});

export const more = style({
  fontSize: 16,
  color: cssVarV2('icon/primary'),
});
