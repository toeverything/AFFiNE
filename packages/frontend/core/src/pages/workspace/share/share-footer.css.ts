import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const footerContainer = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1,
  width: '100%',
  maxWidth: cssVar('editorWidth'),
  marginLeft: 'auto',
  marginRight: 'auto',
  paddingLeft: cssVar('editorSidePadding'),
  paddingRight: cssVar('editorSidePadding'),
  marginBottom: '200px',
  '@media': {
    'screen and (max-width: 800px)': {
      paddingLeft: '24px',
      paddingRight: '24px',
    },
  },
});
export const footer = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  width: '100%',
  padding: '12px',
  background: cssVar('backgroundOverlayPanelColor'),
});

export const description = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
  textAlign: 'center',
});

export const getStartLink = style({
  display: 'flex',
  padding: '0px 4px',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '4px',
  color: cssVar('black'),
  selectors: {
    '&:visited': {
      color: cssVar('black'),
    },
  },
});
