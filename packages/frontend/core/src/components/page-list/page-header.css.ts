import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const headerTitleCell = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});
export const tableHeader = style({
  display: 'flex',
  alignItems: 'center',
  padding: '10px 6px 10px 16px',
  position: 'sticky',
  overflow: 'hidden',
  zIndex: 1,
  top: 0,
  left: 0,
  background: cssVar('backgroundPrimaryColor'),
  transition: 'box-shadow 0.2s ease-in-out',
  transform: 'translateY(-0.5px)', // fix sticky look through issue
});
globalStyle(`[data-has-scroll-top=true] ${tableHeader}`, {
  boxShadow: `0 0.5px ${cssVar('borderColor')}`,
});
export const headerTitleSelectionIconWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  fontSize: '16px',
  selectors: {
    [`${tableHeader}[data-selectable=toggle] &`]: {
      width: 32,
    },
    [`${tableHeader}[data-selection-active=true] &`]: {
      width: 24,
    },
  },
});
