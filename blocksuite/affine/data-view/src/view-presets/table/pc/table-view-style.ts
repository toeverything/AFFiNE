import { css } from '@emotion/css';

import { LEFT_TOOL_BAR_WIDTH } from '../consts';

export const tableViewStyle = css({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',

  '& *': {
    boxSizing: 'border-box',
  },
});
export const tableWrapperStyle = css({
  overflowY: 'auto',
});
export const tableScrollContainerStyle = css({
  position: 'relative',
  width: '100%',
  paddingBottom: '4px',
  zIndex: 1,
  overflowX: 'scroll',
  overflowY: 'hidden',

  '&:hover': {
    paddingBottom: '0px',
  },

  '&::-webkit-scrollbar': {
    WebkitAppearance: 'none',
    display: 'block',
  },

  '&::-webkit-scrollbar:horizontal': {
    height: '4px',
  },

  '&::-webkit-scrollbar-thumb': {
    borderRadius: '2px',
    backgroundColor: 'transparent',
  },

  '&:hover::-webkit-scrollbar:horizontal': {
    height: '8px',
  },

  '&:hover::-webkit-scrollbar-thumb': {
    borderRadius: '16px',
    backgroundColor: 'var(--affine-black-30)',
  },

  '&:hover::-webkit-scrollbar-track': {
    backgroundColor: 'var(--affine-hover-color)',
  },

  '.affine-database-table-container': {
    position: 'relative',
    width: 'fit-content',
    minWidth: '100%',
  },
});
export const tableGroupsContainerStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
});
export const addGroupStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 12px 6px 8px',
  color: 'var(--affine-text-secondary-color)',
  fontSize: '12px',
  lineHeight: '20px',
  position: 'sticky',
  left: `${LEFT_TOOL_BAR_WIDTH}px`,
  borderRadius: '8px',
  cursor: 'pointer',

  '&:hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});
export const addGroupIconStyle = css({
  display: 'flex',
  width: '16px',
  height: '16px',

  '& svg': {
    width: '16px',
    height: '16px',
    fill: 'var(--affine-icon-color)',
  },
});
export const groupsHiddenMessageStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '80px',
  zIndex: 0,
  color: 'var(--affine-text-secondary-color)',
  fontSize: '14px',
  textAlign: 'center',
});
const cellDividerStyle = css({
  width: '1px',
  height: '100%',
  backgroundColor: 'var(--affine-border-color)',
});
const leftToolBarStyle = css({
  display: 'flex',
  alignItems: 'center',
  position: 'sticky',
  zIndex: 1,
  left: 0,
  width: `${LEFT_TOOL_BAR_WIDTH}px`,
  flexShrink: 0,
});
export const tableStyle = {
  leftToolBarStyle,
  cellDividerStyle,
};
