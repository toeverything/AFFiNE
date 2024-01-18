import { globalStyle, style } from '@vanilla-extract/css';

const interactive = style({
  position: 'relative',
  cursor: 'pointer',

  selectors: {
    '&:hover': {
      backgroundColor: 'var(--affine-hover-color)',
    },
    '&::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      opacity: 0,
      borderRadius: 'inherit',
      boxShadow: '0 0 0 3px var(--affine-primary-color)',
      pointerEvents: 'none',
    },
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
      boxShadow: '0 0 0 0px var(--affine-primary-color)',
      pointerEvents: 'none',
    },
    '&:focus-visible::before': {
      opacity: 0.2,
    },
    '&:focus-visible::after': {
      boxShadow: '0 0 0 1px var(--affine-primary-color)',
    },
  },
});

export const calendar = style({
  padding: '16px',
});

export const journalPanel = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
});

export const dailyCount = style({
  height: 0,
  flexGrow: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const dailyCountHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  gap: 8,
});

export const dailyCountNav = style([
  interactive,
  {
    height: 28,
    width: 0,
    flex: 1,
    fontWeight: 500,
    fontSize: 14,
    padding: '4px 8px',
    whiteSpace: 'nowrap',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--affine-text-secondary-color)',
    transition: 'all .3s',

    selectors: {
      '&[aria-selected="true"]': {
        backgroundColor: 'var(--affine-background-tertiary-color)',
        color: 'var(--affine-text-primary-color)',
      },
    },
  },
]);

export const dailyCountContainer = style({
  height: 0,
  flexGrow: 1,
  display: 'flex',
  width: `calc(var(--item-count) * 100%)`,
  transition: 'transform .15s ease',
  transform:
    'translateX(calc(var(--active-index) * 100% / var(--item-count) * -1))',
});
export const dailyCountItem = style({
  width: 'calc(100% / var(--item-count))',
  height: '100%',
});
export const dailyCountContent = style({
  padding: '8px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});
export const dailyCountEmpty = style({
  width: '100%',
  height: '100%',
  maxHeight: 220,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',

  lineHeight: '24px',
  fontSize: 15,
  color: 'var(--affine-text-secondary-color)',
  textAlign: 'center',
  padding: '0 70px',
  fontWeight: 400,
});

// page item
export const pageItem = style([
  interactive,
  {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    borderRadius: 4,
    padding: '0 4px',
    gap: 8,
    height: 30,

    selectors: {
      '&[aria-selected="true"]': {
        backgroundColor: 'var(--affine-hover-color)',
      },
    },
  },
]);
export const pageItemIcon = style({
  width: 20,
  height: 20,
  color: 'var(--affine-icon-color)',
});
export const pageItemLabel = style({
  width: 0,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 500,
  fontSize: 'var(--affine-font-size-sm)',
  color: 'var(--affine-text-primary-color)',
  textAlign: 'left',
  selectors: {
    '[aria-selected="true"] &': {
      // TODO: wait for design
      color: 'var(--affine-primary-color)',
    },
  },
});

// conflict
export const journalConflictBlock = style({
  padding: '0 16px 16px 16px',
});
export const journalConflictWrapper = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
  rowGap: 4,
  columnGap: 8,
});
export const journalConflictMoreTrigger = style([
  interactive,
  {
    color: 'var(--affine-text-secondary-color)',
    height: 30,
    borderRadius: 4,
    padding: '0px 8px',
    fontSize: 'var(--affine-font-size-sm)',
    display: 'flex',
    alignItems: 'center',
  },
]);

// TODO: when date-picker's cell is customizable, we should implement by custom cell
// override date-picker's active day when is not journal
globalStyle(
  `.${journalPanel}[data-is-journal="false"] .react-datepicker__day[aria-selected="true"]`,
  {
    backgroundColor: 'transparent',
    color: 'var(--affine-text-primary-color)',
    fontWeight: 500,
    border: '1px solid var(--affine-primary-color)',
  }
);
