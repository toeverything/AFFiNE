import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const docEditorRoot = style({
  display: 'block',
  background: cssVar('backgroundPrimaryColor'),
});

export const affineDocViewport = style({
  display: 'flex',
  flexDirection: 'column',
  paddingBottom: '150px',
});

export const docContainer = style({
  display: 'block',
  flexGrow: 1,
});

export const docEditorGap = style({
  display: 'block',
  width: '100%',
  margin: '0 auto',
  paddingTop: 50,
  paddingBottom: 50,
  cursor: 'text',
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
