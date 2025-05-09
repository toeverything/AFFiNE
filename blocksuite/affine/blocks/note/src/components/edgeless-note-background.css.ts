import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

import {
  ACTIVE_NOTE_EXTRA_PADDING,
  edgelessNoteContainer,
} from '../note-edgeless-block.css';

export const background = style({
  position: 'absolute',
  borderColor: cssVar('black10'),
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',

  selectors: {
    [`${edgelessNoteContainer}[data-editing="true"] &`]: {
      left: `${-ACTIVE_NOTE_EXTRA_PADDING}px`,
      top: `${-ACTIVE_NOTE_EXTRA_PADDING}px`,
      width: `calc(100% + ${ACTIVE_NOTE_EXTRA_PADDING * 2}px)`,
      height: `calc(100% + ${ACTIVE_NOTE_EXTRA_PADDING * 2}px)`,
      transition: 'left 0.3s, top 0.3s, width 0.3s, height 0.3s',
      boxShadow: cssVar('activeShadow'),
    },
  },
});
