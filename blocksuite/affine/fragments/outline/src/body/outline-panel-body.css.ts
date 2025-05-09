import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const outlinePanelBody = style({
  position: 'relative',
  alignItems: 'start',
  boxSizing: 'border-box',
  width: '100%',
  height: '100%',
  padding: '0 8px',
  flexGrow: 1,
  overflowY: 'scroll',
});

export const cardList = style({
  position: 'relative',
});

export const edgelessCardListTitle = style({
  width: '100%',
  fontSize: '14px',
  lineHeight: '24px',
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
  paddingLeft: '8px',
  height: '40px',
  boxSizing: 'border-box',
  padding: '6px 8px',
  marginTop: '8px',
});

export const insertIndicator = style({
  height: '2px',
  borderRadius: '1px',
  backgroundColor: cssVar('brandColor'),
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  contain: 'layout size',
  width: '100%',
});

export const emptyPanel = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
});

export const emptyPanelPlaceholder = style({
  marginTop: '240px',
  alignSelf: 'center',
  width: '190px',
  height: '48px',
  color: cssVarV2('text/secondary'),
  textAlign: 'center',
  fontSize: '15px',
  fontStyle: 'normal',
  fontWeight: 400,
  lineHeight: '24px',
});
