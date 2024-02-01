import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

const br = 8;

export const wrapper = style({
  display: 'flex',
  minHeight: 800,
  border: '1px solid rgba(100, 100, 100, 0.5)',
  borderRadius: br,
});

export const sidebar = style({
  width: 200,
  borderRight: '1px solid rgba(100, 100, 100, 0.5)',
  padding: 4,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const content = style({
  width: 0,
  flexGrow: 1,
  padding: 8,
  background: 'rgba(100, 100, 100, 0.02)',
  borderTopRightRadius: 'inherit',
  borderBottomRightRadius: 'inherit',
});

export const dragItem = style({
  border: '1px solid rgba(100, 100, 100, 0.3)',
  borderRadius: 4,
  padding: 8,
  ':hover': {
    background: 'rgba(100, 100, 100, 0.1)',
  },
});

export const basicRenderItem = style({
  padding: 8,
  borderRadius: 4,
  width: '100%',
  height: '100%',
});

export const renderRed = style([
  basicRenderItem,
  {
    background: 'rgba(215, 80, 40, 0.2)',
  },
]);

export const renderGreen = style([
  basicRenderItem,
  {
    background: 'rgba(80, 215, 40, 0.2)',
  },
]);

export const renderBlue = style([
  basicRenderItem,
  {
    background: 'rgba(40, 80, 215, 0.2)',
  },
]);

export const preview = style({
  minWidth: 200,
  minHeight: 0,
  background: 'white',
  boxShadow: '0 0 8px rgba(0, 0, 0, 0.2)',
  borderRadius: br,
  padding: 7,
  cursor: 'grabbing',
  transition: 'all .24s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',

  selectors: {
    '&[data-ready-to-drop="true"]': {
      minWidth: 200,
      minHeight: 80,
      border: '1px solid ' + cssVar('brandColor'),
      padding: 5,
    },
  },
});
