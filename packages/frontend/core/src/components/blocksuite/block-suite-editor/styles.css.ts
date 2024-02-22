import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const docEditorRoot = style({
  display: 'block',
  height: '100%',
  overflow: 'hidden',
  background: cssVar('backgroundPrimaryColor'),
});

// brings styles of .affine-doc-viewport from blocksuite
export const affineDocViewport = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflowX: 'hidden',
  overflowY: 'auto',
  userSelect: 'none',
  containerName: 'viewport',
  // todo: find out what this does in bs
  containerType: 'inline-size',
  background: cssVar('backgroundPrimaryColor'),
  '@media': {
    print: {
      display: 'none',
      zIndex: -1,
    },
  },
});
export const docContainer = style({
  display: 'block',
  paddingBottom: 64,
  flexGrow: 1,
});
const titleTagBasic = style({
  fontSize: cssVar('fontH4'),
  fontWeight: 600,
  padding: '0 4px',
  borderRadius: '4px',
  marginLeft: '4px',
});
export const titleDayTag = style([
  titleTagBasic,
  {
    color: cssVar('textSecondaryColor'),
  },
]);
export const titleTodayTag = style([
  titleTagBasic,
  {
    color: cssVar('brandColor'),
  },
]);
export const pageReferenceIcon = style({
  verticalAlign: 'middle',
  fontSize: '1.1em',
  transform: 'translate(2px, -1px)',
});
