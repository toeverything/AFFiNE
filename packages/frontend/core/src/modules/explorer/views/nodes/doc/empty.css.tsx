import { cssVar } from '@toeverything/theme';
import { fallbackVar, style } from '@vanilla-extract/css';

import { levelIndent } from '../../tree/node.css';

export const noReferences = style({
  fontSize: cssVar('fontSm'),
  textAlign: 'left',
  padding: '4px 0 4px 32px',
  color: cssVar('black30'),
  userSelect: 'none',
  paddingLeft: `calc(${fallbackVar(levelIndent, '20px')} + 32px)`,
  selectors: {
    '&[data-dragged-over="true"]': {
      background: cssVar('--affine-hover-color'),
      borderRadius: '4px',
    },
  },
});
