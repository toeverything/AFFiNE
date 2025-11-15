import { css } from '@emotion/css';
import { cssVarV2 } from '@toeverything/theme/v2';

import { LEFT_TOOL_BAR_WIDTH } from '../consts.js';

export const tableView = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
});

export const tableContainer = css({
  overflowY: 'auto',
});

export const tableBlockTable = css({
  position: 'relative',
  width: '100%',
  paddingBottom: '4px',
  zIndex: 1,
  overflowX: 'scroll',
  overflowY: 'hidden',
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
});

export const tableContainer2 = css({
  position: 'relative',
  width: 'fit-content',
  minWidth: '100%',
});

export const addGroup = css({
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
