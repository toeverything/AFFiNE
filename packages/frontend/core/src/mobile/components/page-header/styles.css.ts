import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  width: '100%',
  position: 'fixed',
  top: 0,
  // Above editor chrome; keep taps on header chrome from falling through to
  // contenteditable (which would open the iOS keyboard instead of menus).
  zIndex: 100,
  backgroundColor: cssVarV2('layer/background/secondary'),
  pointerEvents: 'auto',
});
export const headerSpacer = style({
  height: 44,
});
export const inner = style({
  height: 44,
  padding: '0 6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  // Solid hit target for the whole bar — even if the title ignores pointers,
  // events must land here rather than the editor underneath.
  pointerEvents: 'auto',
  position: 'relative',
});
export const content = style({
  // Flex middle slot (not absolute) so the title can never overlap/steal or
  // punch pointer-events holes over the more/share buttons on WKWebView.
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  pointerEvents: 'none',
  selectors: {
    '&:not(.center)': {
      justifyContent: 'flex-start',
    },
  },
});
export const spacer = style({
  width: 0,
  flex: 1,
});
export const prefix = style({
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  flexShrink: 0,
  position: 'relative',
  zIndex: 1,
  pointerEvents: 'auto',
});
export const suffix = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
  position: 'relative',
  zIndex: 1,
  pointerEvents: 'auto',
});
