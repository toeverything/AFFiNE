import { cssVar } from '@toeverything/theme';
import { bodyRegular } from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

export const levelIndent = createVar();

export const itemRoot = style({
  display: 'inline-flex',
  alignItems: 'center',
  textAlign: 'left',
  color: 'inherit',
  width: '100%',
  minHeight: '30px',
  userSelect: 'none',
  cursor: 'pointer',
  fontSize: cssVar('fontSm'),
  position: 'relative',
  marginTop: '0px',
  padding: '8px',
  borderRadius: 0,
  gap: 12,
  selectors: {
    '&[data-disabled="true"]': {
      cursor: 'default',
      color: cssVar('textSecondaryColor'),
      pointerEvents: 'none',
    },
    '&[data-dragging="true"]': {
      opacity: 0.5,
    },
  },

  ':after': {
    content: '',
    width: `calc(100% + ${levelIndent})`,
    height: 0.5,
    background: cssVar('borderColor'),
    bottom: 0,
    position: 'absolute',
    right: 0,
  },
});

export const collapsedIconContainer = style({
  width: '16px',
  height: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  transition: 'transform 0.2s',
  color: cssVarV2('icon/primary'),
  fontSize: 16,
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
    '&[data-disabled="true"]': {
      opacity: 0.3,
      pointerEvents: 'none',
    },
  },
});
export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
  },
});

export const itemMain = style({
  display: 'flex',
  alignItems: 'center',
  width: 0,
  flex: 1,
  position: 'relative',
  gap: 12,
});

export const iconContainer = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  color: cssVarV2('icon/primary'),

  width: 32,
  height: 32,
  fontSize: 24,
});

export const itemContent = style([
  bodyRegular,
  {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    alignItems: 'center',
    flex: 1,
    color: cssVarV2('text/primary'),
  },
]);

export const itemRenameAnchor = style({
  pointerEvents: 'none',
  position: 'absolute',
  left: 0,
  top: -10,
  width: 10,
  height: 10,
});

export const contentContainer = style({
  marginTop: 0,
  paddingLeft: levelIndent,
  position: 'relative',
});

export const linkItemRoot = style({
  color: 'inherit',
});

export const collapseContentPlaceholder = style({
  display: 'none',
  selectors: {
    '&:only-child': {
      display: 'initial',
    },
  },
});
