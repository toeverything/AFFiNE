import { style } from '@vanilla-extract/css';

export const root = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: '32px',
});

export const tagsScrollContainer = style({
  overflow: 'auto',
  display: 'flex',
  alignItems: 'center',
  columnGap: '8px',
  height: '100%',
  width: '100%',
});

export const innerContainer = style({
  position: 'absolute',
  height: '100%',
  maxWidth: '100%',
  transition: 'all 0.2s 0.3s ease-in-out',
  padding: '0 16px',
  selectors: {
    [`${root}:hover &`]: {
      maxWidth: 'var(--hover-max-width)',
    },
  },
});

// background with linear gradient hack
export const innerBackdrop = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '100%',
  opacity: 0,
  transition: 'all 0.2s',
  background:
    'linear-gradient(90deg, transparent 0%, var(--affine-hover-color-filled) 40%)',
  selectors: {
    [`${root}:hover &`]: {
      opacity: 1,
    },
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
