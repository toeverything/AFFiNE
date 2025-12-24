import { css } from '@emotion/css';

export const tableContainer = css({
  display: 'block',
  padding: '10px 0 18px 10px',
  overflowX: 'auto',
  overflowY: 'visible',
  '::-webkit-scrollbar': {
    height: '8px',
  },
  '::-webkit-scrollbar-thumb:horizontal': {
    borderRadius: '4px',
    backgroundColor: 'transparent',
  },
  '::-webkit-scrollbar-track:horizontal': {
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

export const tableWrapper = css({
  overflow: 'visible',
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
  position: 'relative',
  width: 'max-content',
});

export const table = css({});

export const rowStyle = css({});
