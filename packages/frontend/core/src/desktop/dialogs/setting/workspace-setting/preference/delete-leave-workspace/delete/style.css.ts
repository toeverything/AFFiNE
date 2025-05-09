import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const modalWrapper = style({
  position: 'relative',
  padding: '0px',
  width: '560px',
  background: cssVar('backgroundOverlayPanelColor'),
  borderRadius: '12px',
});
export const modalHeader = style({
  margin: '44px 0px 12px 0px',
  width: '560px',
  fontWeight: '600',
  fontSize: '20px;',
  textAlign: 'center',
});
export const inputContent = style({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  margin: '24px 0',
  fontSize: cssVar('fontBase'),
});
export const workspaceName = style({
  fontWeight: '600',
});
