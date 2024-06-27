import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
const HANDLE_SIZE = 24;
export const container = style({
  position: 'relative',
  border: '1px solid rgba(100, 100, 100, 0.2)',
  padding: 8,
  borderRadius: 4,
  borderBottomRightRadius: HANDLE_SIZE / 2,
});
export const cornerHandle = style({
  position: 'absolute',
  top: `calc(100% - ${HANDLE_SIZE / 1.5}px)`,
  left: `calc(100% - ${HANDLE_SIZE / 1.5}px)`,
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  borderRadius: '50%',
  border: '2px solid transparent',
  borderRightColor: 'rgba(100, 100, 100, 0.3)',
  transform: 'rotate(45deg)',
  cursor: 'nwse-resize',
});
export const display = style({
  position: 'absolute',
  left: 32,
  top: 12,
  transform: 'rotate(-45deg)',
  transformOrigin: '0 0',
  whiteSpace: 'nowrap',
  borderRadius: 6,
  background: cssVar('black'),
  color: cssVar('white'),
  borderTopLeftRadius: 0,

  maxWidth: 0,
  maxHeight: 0,
  padding: 0,
  transition: 'all 0.23s ease',
  overflow: 'hidden',

  selectors: {
    '[data-resizing="true"] &': {
      padding: '4px 8px',
      maxWidth: 200,
      maxHeight: 40,
    },
  },
});
