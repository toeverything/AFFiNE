import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  columnGap: '8px',
  overflow: 'auto',
  position: 'relative',
  maxWidth: '100%',
});

const range = (start: number, end: number) => {
  const result = [];
  for (let i = start; i < end; i++) {
    result.push(i);
  }
  return result;
};

export const tag = style({
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
  selectors: range(0, 20).reduce((selectors, i) => {
    return {
      ...selectors,
      [`&:nth-child(${i + 1})`]: {
        left: `${i * 32}px`,
      },
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
