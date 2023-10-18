import { style } from '@vanilla-extract/css';

export const root = style({
  position: 'relative',
  width: '100%',
  height: '100%',
});

export const innerContainer = style({
  display: 'flex',
  alignItems: 'center',
  columnGap: '8px',
  overflow: 'auto',
  position: 'absolute',
  height: '100%',
  maxWidth: '100%',
  transition: 'max-width 0.2s 0.2s ease-in-out',
  ':hover': {
    maxWidth: 'var(--hover-max-width)',
  },
});

const range = (start: number, end: number) => {
  const result = [];
  for (let i = start; i < end; i++) {
    result.push(i);
  }
  return result;
};

export const tag = style({
  height: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 8px',
  columnGap: '4px',
  borderRadius: '10px',
  border: '1px solid var(--affine-border-color)',
  fontSize: 'var(--affine-font-xs)',
  background: 'var(--affine-background-primary-color)',
  position: 'sticky',
  left: 0,
  selectors: range(0, 20).reduce((selectors, i) => {
    return {
      ...selectors,
      [`&:nth-last-child(${i + 1})`]: {
        right: `${i * 32}px`,
      },
    };
  }, {}),
});

export const tagIndicator = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
});

export const tagLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
