import { EDGELESS_BLOCK_CHILD_PADDING } from '@blocksuite/affine-shared/consts';
import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const ACTIVE_NOTE_EXTRA_PADDING = 20;

export const edgelessNoteContainer = style({
  height: '100%',
  padding: `${EDGELESS_BLOCK_CHILD_PADDING}px`,
  boxSizing: 'border-box',
  pointerEvents: 'all',
  transformOrigin: '0 0',
  fontWeight: '400',
  lineHeight: cssVar('lineHeight'),
});

export const collapseButton = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  zIndex: 2,
  position: 'absolute',
  bottom: 0,
  left: '50%',
  transform: 'translateX(-50%)',
  opacity: 0.2,
  transition: 'opacity 0.3s',

  ':hover': {
    opacity: 1,
  },
  selectors: {
    '&.flip': {
      transform: 'translateX(-50%) rotate(180deg)',
    },
  },
});

export const noteBackground = style({
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

export const clipContainer = style({
  width: '100%',
  height: '100%',
});

export const collapsedContent = style({
  position: 'absolute',
  background: cssVar('white'),
  opacity: 0.5,
  pointerEvents: 'none',
  border: `2px ${cssVar('blue')} solid`,
  borderTop: 'unset',
  borderRadius: '0 0 8px 8px',
});
