import { cssVar } from '@toeverything/theme';
import { style, type StyleRule } from '@vanilla-extract/css';

export const docEditorRoot = style({
  overflowX: 'clip',
  display: 'flex',
  flexDirection: 'column',
});

export const affineDocViewport = style({
  height: '100%',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  paddingBottom: '100px',
});
export const affineEdgelessDocViewport = style({
  height: '100%',
  flex: 1,
});

export const docContainer = style({
  display: 'block',
  selectors: ['generating', 'finished', 'error'].reduce<
    NonNullable<StyleRule['selectors']>
  >((rules, state) => {
    rules[`&:has(affine-ai-panel-widget[data-state='${state}'])`] = {
      paddingBottom: '980px',
    };
    return rules;
  }, {}),
});

export const docEditorGap = style({
  display: 'block',
  width: '100%',
  margin: '0 auto',
  paddingTop: 50,
  paddingBottom: 50,
  cursor: 'text',
  flexGrow: 1,
});

const titleTagBasic = style({
  fontSize: cssVar('fontH4'),
  fontWeight: 600,
  padding: '0 4px',
  borderRadius: '4px',
  marginLeft: '4px',
  lineHeight: '0px',
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

export const docPropertiesTableContainer = style({
  display: 'flex',
  width: '100%',
  justifyContent: 'center',
});

export const docPropertiesTable = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: '100%',
  maxWidth: cssVar('editorWidth'),
  padding: `0 ${cssVar('editorSidePadding', '24px')}`,
  '@container': {
    [`viewport (width <= 640px)`]: {
      padding: '0 16px',
    },
  },
});
