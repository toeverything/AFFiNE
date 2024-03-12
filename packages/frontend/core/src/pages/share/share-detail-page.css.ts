import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  height: '100%',
  overflow: 'hidden',
  width: '100%',
});

export const mainContainer = style({
  display: 'flex',
  flex: 1,
  height: '100%',
  position: 'relative',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
  background: cssVar('backgroundPrimaryColor'),
});

export const editorContainer = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  zIndex: 0,
});

export const link = style({
  position: 'absolute',
  right: '50%',
  transform: 'translateX(50%)',
  bottom: '20px',
  zIndex: cssVar('zIndexPopover'),
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  background: cssVar('black'),
  borderRadius: '8px',
  border: `1px solid ${cssVar('pureBlack10')}`,
  boxShadow: cssVar('--affine-button-inner-shadow'),
  color: cssVar('white'),
  padding: '8px 18px',
  gap: '4px',
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const linkText = style({
  padding: '0px 4px',
  fontSize: cssVar('fontBase'),
  fontWeight: 700,
  whiteSpace: 'nowrap',
});
