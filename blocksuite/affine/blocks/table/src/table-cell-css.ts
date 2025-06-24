import { cssVar, cssVarV2 } from '@blocksuite/affine-shared/theme';
import { css } from '@emotion/css';

export const cellContainerStyle = css({
  position: 'relative',
  alignItems: 'center',
  border: '1px solid',
  borderColor: cssVarV2.table.border,
  borderCollapse: 'collapse',
  isolation: 'auto',
  textAlign: 'start',
  verticalAlign: 'top',
});

export const columnOptionsCellStyle = css({
  position: 'absolute',
  height: '0',
  top: '0',
  left: '0',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const columnOptionsStyle = css({
  cursor: 'pointer',
  zIndex: 2,
  width: '28px',
  height: '16px',
  backgroundColor: cssVarV2.table.headerBackground.default,
  borderRadius: '8px',
  boxShadow: cssVar('buttonShadow'),
  opacity: 0,
  transition: 'opacity 0.2s ease-in-out',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '--three-pointer-icon-color': cssVarV2.icon.secondary,
  ':hover': {
    opacity: 1,
  },
  '&.active': {
    opacity: 1,
    backgroundColor: cssVarV2.table.indicator.activated,
    '--three-pointer-icon-color': cssVarV2.table.indicator.pointerActive,
  },
});

export const rowOptionsCellStyle = css({
  position: 'absolute',
  top: '0',
  left: '0',
  width: '0',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
});

export const rowOptionsStyle = css({
  cursor: 'pointer',
  zIndex: 2,
  width: '16px',
  height: '28px',
  backgroundColor: cssVarV2.table.headerBackground.default,
  borderRadius: '8px',
  boxShadow: cssVar('buttonShadow'),
  opacity: 0,
  transition: 'opacity 0.2s ease-in-out',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  '--three-pointer-icon-color': cssVarV2.icon.secondary,
  ':hover': {
    opacity: 1,
  },
  '&.active': {
    opacity: 1,
    backgroundColor: cssVarV2.table.indicator.activated,
    '--three-pointer-icon-color': cssVarV2.table.indicator.pointerActive,
  },
});

export const threePointerIconStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '2px',
});

export const threePointerIconDotStyle = css({
  width: '3px',
  height: '3px',
  backgroundColor: 'var(--three-pointer-icon-color)',
  borderRadius: '50%',
});

export const indicatorStyle = css({
  position: 'absolute',
  backgroundColor: cssVarV2.table.indicator.activated,
  zIndex: 2,
  transition: 'opacity 0.2s ease-in-out',
  pointerEvents: 'none',
});

export const columnIndicatorStyle = css([
  indicatorStyle,
  {
    top: '-1px',
    height: 'calc(100% + 2px)',
    width: '5px',
  },
]);

export const columnRightIndicatorStyle = css([
  columnIndicatorStyle,
  {
    cursor: 'ew-resize',
    right: '-3px',
    pointerEvents: 'auto',
  },
]);

export const columnLeftIndicatorStyle = css([
  columnIndicatorStyle,
  {
    left: '-2px',
  },
]);

export const rowIndicatorStyle = css([
  indicatorStyle,
  {
    left: '-1px',
    width: 'calc(100% + 2px)',
    height: '5px',
  },
]);

export const rowBottomIndicatorStyle = css([
  rowIndicatorStyle,
  {
    bottom: '-3px',
  },
]);

export const rowTopIndicatorStyle = css([
  rowIndicatorStyle,
  {
    top: '-2px',
  },
]);
