import { style } from '@vanilla-extract/css';

export const root = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: '32px',
});

export const tagsContainer = style({
  display: 'flex',
  alignItems: 'center',
});

export const tagsScrollContainer = style([
  tagsContainer,
  {
    overflow: 'auto',
    height: '100%',
    gap: '8px',
  },
]);

export const tagsListContainer = style([
  tagsContainer,
  {
    flexWrap: 'wrap',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
  },
]);

export const innerContainer = style({
  display: 'flex',
  columnGap: '8px',
  alignItems: 'center',
  position: 'absolute',
  height: '100%',
  maxWidth: '100%',
  transition: 'all 0.2s 0.3s ease-in-out',
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

export const tag = style({
  height: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 8px',
  color: 'var(--affine-text-primary-color)',
});

export const tagSticky = style([
  tag,
  {
    fontSize: 'var(--affine-font-xs)',
    borderRadius: '10px',
    columnGap: '4px',
    border: '1px solid var(--affine-border-color)',
    background: 'var(--affine-background-primary-color)',
    maxWidth: '128px',
    position: 'sticky',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    left: 0,
  },
]);

export const tagListItem = style([
  tag,
  {
    fontSize: 'var(--affine-font-sm)',
    padding: '4px 12px',
    columnGap: '8px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    height: '30px',
  },
]);

export const showMoreTag = style({
  fontSize: 'var(--affine-font-h-5)',
  right: 0,
  position: 'sticky',
  display: 'inline-flex',
});

export const tagIndicator = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
});

export const tagLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
