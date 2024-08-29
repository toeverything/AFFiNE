import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

export const tagColorVar = createVar();

export const tags = style({
  width: '100%',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  position: 'relative',

  transition: 'height 0.23s',
  overflow: 'hidden',
});

export const tag = style({
  visibility: 'hidden',
  position: 'absolute',
  // transition: 'all 0.23s',

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
