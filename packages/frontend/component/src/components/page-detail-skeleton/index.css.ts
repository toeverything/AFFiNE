import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const pageDetailSkeletonStyle = style({
  padding: '0 20px',
});
export const pageDetailSkeletonTitleStyle = style({
  height: '52px',
  width: '100%',
});
export const blockSuiteEditorStyle = style({
  maxWidth: cssVar('editorWidth'),
  margin: '0 2rem',
  padding: '0 24px',
});
export const blockSuiteEditorHeaderStyle = style({
  marginTop: '40px',
  marginBottom: '40px',
});
