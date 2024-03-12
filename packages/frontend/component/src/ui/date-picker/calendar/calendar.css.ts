import { cssVar } from '@toeverything/theme';
import { createVar, style } from '@vanilla-extract/css';

// variables
export const vars = {
  gapX: createVar('gapX'),
  gapY: createVar('gapY'),
};

// basic
export const spacer = style({ flex: 1 });
export const spacerX = style([spacer, { width: 0 }]);

// interactive style
export const basicInteractive = style({
  cursor: 'pointer',
  position: 'relative',
  whiteSpace: 'nowrap',
  selectors: {
    '&::before, &::after': {
      content: '',
      position: 'absolute',
      inset: 0,
      zIndex: 1,
      pointerEvents: 'none',
      borderRadius: 'inherit',
    },
  },
});
export const hoverInteractive = style([
  basicInteractive,
  {
    selectors: {
      '&::after': {
        transition: 'background-color 0.2s ease',
      },
      '&:hover::after': {
        backgroundColor: cssVar('hoverColor'),
      },
    },
  },
]);
export const focusInteractive = style([
  basicInteractive,
  {
    selectors: {
      '&::before': {
        opacity: 0,
        boxShadow: `0 0 0 2px ${cssVar('brandColor')}`,
      },
      '&::after': {
        border: '1px solid transparent',
      },

      '&:focus-visible::before': {
        opacity: 0.5,
      },
      '&:focus-visible::after': {
        borderColor: cssVar('brandColor'),
      },
    },
  },
]);
export const disabledInteractive = style([
  basicInteractive,
  {
    selectors: {
      '&[disabled], &[aria-disabled="true"]': {
        cursor: 'not-allowed',
        color: cssVar('textDisableColor'),
      },
    },
  },
]);
export const interactive = style([
  focusInteractive,
  hoverInteractive,
  disabledInteractive,
]);

export const basicCell = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '28px',
  maxWidth: '56px',
  flex: '1',
  userSelect: 'none',
});

// roots
export const calendarRoot = style({
  minWidth: `calc(28px * 7 + ${vars.gapX} * 6)`,
});
export const calendarWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.gapY,
});
export const calendarHeader = style({
  display: 'flex',
  alignItems: 'center',
});

// header
export const headerLayoutCell = style([basicCell, { height: 'auto' }]);
export const headerLayoutCellOrigin = style({
  width: 0,
  height: 'fit-content',
  display: 'flex',
  selectors: {
    '[data-is-left="true"] &': {
      justifyContent: 'flex-start',
      marginLeft: '-24px',
    },
    '[data-is-right="true"] &': {
      justifyContent: 'flex-end',
      marginRight: '-30px',
    },

    '[data-mode="month"] [data-is-left="true"] &': {
      marginLeft: '-36px',
    },
    '[data-mode="month"] [data-is-right="true"] &': {
      marginRight: '-44px',
    },

    '[data-mode="year"] [data-is-left="true"] &': {
      marginLeft: '-48px',
    },
    '[data-mode="year"] [data-is-right="true"] &': {
      marginRight: '-52px',
    },
  },
});
export const calendarHeaderTriggerButton = style([
  interactive,
  {
    display: 'inline-flex',
    lineHeight: '22px',
    fontSize: 'var(--affine-font-sm)',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
  },
]);
export const headerNavButtons = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
});
export const headerNavGapFallback = style({
  width: 8,
});
export const headerNavToday = style([
  interactive,
  {
    fontSize: 'var(--affine-font-sm)',
    fontWeight: 400,
    lineHeight: '22px',
    padding: '0 4px',
    borderRadius: 4,
    color: cssVar('iconColor'),
  },
]);

// month view body
export const monthViewBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.gapY,
});
export const monthViewRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.gapX,
});
export const monthViewHeaderCell = style([
  basicCell,
  {
    fontSize: 'var(--affine-font-xs)',
    fontWeight: 500,
    color: cssVar('textSecondaryColor'),
    height: 28,
  },
]);
export const monthViewBodyCell = style([
  basicCell,
  {
    height: '28px',
  },
]);
export const monthViewBodyCellInner = style([
  interactive,
  {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    fontSize: cssVar('fontSm'),
    color: cssVar('textPrimaryColor'),
    fontWeight: 400,

    selectors: {
      '&[data-is-today="true"]': {
        fontWeight: 600,
        color: cssVar('brandColor'),
      },
      '&[data-not-current-month="true"]': {
        color: cssVar('black10'),
      },
      '&[data-selected="true"]': {
        backgroundColor: cssVar('brandColor'),
        fontWeight: 500,
        color: cssVar('pureWhite'),
      },
    },
  },
]);

// year view body
export const yearViewBody = style([monthViewBody, { gap: 18, paddingTop: 18 }]);
export const yearViewRow = style([monthViewRow]);
export const yearViewBodyCell = style([monthViewBodyCell, { height: 34 }]);
export const yearViewBodyCellInner = style([
  monthViewBodyCellInner,
  {
    fontSize: cssVar('fontBase'),
    fontWeight: 400,
    lineHeight: '24px',
    selectors: {
      // no highlight
      // '&[data-is-today="true"]': {},
      '&[data-selected="true"]': {
        background: 'transparent',
        color: cssVar('textEmphasisColor'),
        fontWeight: 500,
      },
    },
  },
]);

// decade view body
export const decadeViewBody = style([yearViewBody]);
export const decadeViewRow = style([yearViewRow]);
export const decadeViewBodyCell = style([
  yearViewBodyCell,
  {
    maxWidth: 100,
  },
]);
export const decadeViewBodyCellInner = style([yearViewBodyCellInner]);
