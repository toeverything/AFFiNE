import { type ComplexStyleRule, style } from '@vanilla-extract/css';

export const headerTitleContainer = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexGrow: 1,
  position: 'relative',
  width: '100%',
});

export const titleEditButton = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  WebkitAppRegion: 'no-drag',
} as ComplexStyleRule);

export const titleInput = style({
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
  margin: 'auto',
  width: '100%',
  height: '100%',

  selectors: {
    '&:focus': {
      border: '1px solid var(--affine-black-10)',
      borderRadius: '8px',
      height: '32px',
      padding: '6px 8px',
    },
  },
});
export const shadowTitle = style({
  visibility: 'hidden',
});
