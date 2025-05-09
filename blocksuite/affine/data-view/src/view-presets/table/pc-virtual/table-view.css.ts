import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

import { LEFT_TOOL_BAR_WIDTH } from '../consts.js';

export const tableView = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
});

export const tableViewAllElements = style({
  boxSizing: 'border-box',
});

export const tableContainer = style({
  overflowY: 'auto',
});

export const tableTitleContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: '44px',
  margin: '2px 0 2px',
});

export const tableBlockTable = style({
  position: 'relative',
  width: '100%',
  paddingBottom: '4px',
  zIndex: 1,
  overflowX: 'scroll',
  overflowY: 'hidden',
  selectors: {
    '&::-webkit-scrollbar': {
      height: '8px',
    },
    '&::-webkit-scrollbar-thumb:horizontal': {
      borderRadius: '4px',
      backgroundColor: 'transparent',
    },
    '&::-webkit-scrollbar-track:horizontal': {
      backgroundColor: 'transparent',
      height: '8px',
    },
    '&:hover::-webkit-scrollbar-thumb:horizontal': {
      borderRadius: '4px',
      backgroundColor: 'var(--affine-black-30)',
    },
    '&:hover::-webkit-scrollbar-track:horizontal': {
      backgroundColor: 'var(--affine-hover-color)',
      height: '8px',
    },
  },
});

export const tableContainer2 = style({
  position: 'relative',
  width: 'fit-content',
  minWidth: '100%',
});

export const tableBlockTagCircle = style({
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  display: 'inline-block',
});

export const tableBlockTag = style({
  display: 'inline-flex',
  borderRadius: '11px',
  alignItems: 'center',
  padding: '0 8px',
  cursor: 'pointer',
});

export const cellDivider = style({
  width: '1px',
  height: '100%',
  backgroundColor: cssVarV2.layer.insideBorder.border,
});

export const tableLeftBar = style({
  display: 'flex',
  alignItems: 'center',
  position: 'sticky',
  zIndex: 1,
  left: 0,
  width: `${LEFT_TOOL_BAR_WIDTH}px`,
  flexShrink: 0,
});

export const tableBlockRows = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-start',
});
export const addGroup = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 12px 6px 8px',
  color: cssVarV2.text.secondary,
  fontSize: '12px',
  lineHeight: '20px',
  position: 'sticky',
  left: `${LEFT_TOOL_BAR_WIDTH}px`,
});
