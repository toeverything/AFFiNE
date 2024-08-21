import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const container = style({
  width: '100%',
  maxWidth: cssVar('--affine-editor-width'),
  marginLeft: 'auto',
  marginRight: 'auto',
  paddingLeft: cssVar('--affine-editor-side-padding', '24'),
  paddingRight: cssVar('--affine-editor-side-padding', '24'),
  fontSize: cssVar('--affine-font-base'),
  '@container': {
    [`viewport (width <= 640px)`]: {
      padding: '0 24px',
    },
  },
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const dividerContainer = style({
  height: '16px',
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const divider = style({
  background: cssVar('--affine-border-color'),
  height: '0.5px',
  width: '100%',
});

export const titleLine = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const title = style({
  fontWeight: 500,
  fontSize: '15px',
  lineHeight: '24px',
  color: cssVar('--affine-text-primary-color'),
});

export const showButton = style({
  width: '56px',
  height: '28px',
  borderRadius: '8px',
  border: '1px solid ' + cssVar('--affine-border-color'),
  backgroundColor: cssVar('--affine-white'),
  textAlign: 'center',
  fontSize: '12px',
  lineHeight: '28px',
  fontWeight: '500',
  color: cssVar('--affine-text-primary-color'),
  cursor: 'pointer',
});

export const linksContainer = style({
  marginBottom: '16px',
});

export const linksTitles = style({
  color: cssVar('--affine-text-secondary-color'),
  height: '32px',
  lineHeight: '32px',
});

export const link = style({
  width: '100%',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  whiteSpace: 'nowrap',
});
