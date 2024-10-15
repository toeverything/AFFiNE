import { cssVar } from '@toeverything/theme';
import { createVar, style } from '@vanilla-extract/css';

export const terminalSize = createVar();
export const horizontalIndent = createVar();
export const indicatorColor = createVar();

export const treeLine = style({
  vars: {
    [terminalSize]: '8px',
  },
  // To make things a bit clearer we are making the box that the indicator in as
  // big as the whole tree item
  position: 'absolute',
  top: 0,
  right: 0,
  left: horizontalIndent,
  bottom: 0,

  // We don't want to cause any additional 'dragenter' events
  pointerEvents: 'none',

  // Terminal
  '::before': {
    display: 'block',
    content: '""',
    position: 'absolute',
    zIndex: 2,

    boxSizing: 'border-box',
    width: terminalSize,
    height: terminalSize,
    left: 0,
    background: 'transparent',
    borderColor: indicatorColor,
    borderWidth: 2,
    borderRadius: '50%',
    borderStyle: 'solid',
  },

  // Line
  '::after': {
    display: 'block',
    content: '""',
    position: 'absolute',
    zIndex: 1,
    background: indicatorColor,
    left: `calc(${terminalSize} / 2)`, // putting the line to the right of the terminal
    height: 2,
    right: 0,
  },

  selectors: {
    ['&[data-no-terminal="true"]::before']: {
      display: 'none',
    },
  },
});

export const lineAboveStyles = style({
  // terminal
  '::before': {
    top: 0,
    // move to position to be a 'cap' on the line
    transform: `translate(calc(-0.5 * ${terminalSize}), calc(-0.5 * ${terminalSize}))`,
  },
  // line
  '::after': {
    top: `${-0.5 * 2}px`,
  },
});

export const lineBelowStyles = style({
  '::before': {
    bottom: 0,
    // move to position to be a 'cap' on the line
    transform: `translate(calc(-0.5 * ${terminalSize}), calc(0.5 * ${terminalSize}))`,
  },
  // line
  '::after': {
    bottom: `${-0.5 * 2}px`,
  },
});

export const outlineStyles = style({
  // To make things a bit clearer we are making the box that the indicator in as
  // big as the whole tree item
  position: 'absolute',
  top: 0,
  right: 0,
  left: horizontalIndent,
  bottom: 0,

  // We don't want to cause any additional 'dragenter' events
  pointerEvents: 'none',

  border: `2px solid ${indicatorColor}`,
  // TODO: make this a prop?
  // For now: matching the Confluence tree item border radius
  borderRadius: '3px',
});

export const horizontal = style({
  height: 2,
  left: `calc(${terminalSize}/2)`,
  right: 0,
  '::before': {
    // Horizontal indicators have the terminal on the left
    left: `calc(-1 * ${terminalSize})`,
  },
});

export const vertical = style({
  width: 2,
  top: `calc(${terminalSize}/2)`,
  bottom: 0,
  '::before': {
    // Vertical indicators have the terminal at the top
    top: `calc(-1 * ${terminalSize})`,
  },
});

export const localLineOffset = createVar();

export const top = style({
  top: localLineOffset,
  '::before': {
    top: `calc(-1 * ${terminalSize} + 1px)`,
  },
});
export const right = style({
  right: localLineOffset,
  '::before': {
    right: `calc(-1 * ${terminalSize} + 1px)`,
  },
});
export const bottom = style({
  bottom: localLineOffset,
  '::before': {
    bottom: `calc(-1 * ${terminalSize} + 1px)`,
  },
});
export const left = style({
  left: localLineOffset,
  '::before': {
    left: `calc(-1 * ${terminalSize} + 1px)`,
  },
});

export const edgeLine = style({
  vars: {
    [terminalSize]: '6px',
  },
  display: 'block',
  position: 'absolute',
  zIndex: 1,
  // Blocking pointer events to prevent the line from triggering drag events
  // Dragging over the line should count as dragging over the element behind it
  pointerEvents: 'none',
  background: cssVar('--affine-primary-color'),

  // Terminal
  '::before': {
    content: '""',
    width: 0,
    height: 0,
    boxSizing: 'border-box',
    position: 'absolute',
    border: `${terminalSize} solid ${cssVar('--affine-primary-color')}`,
    borderRadius: '50%',
  },

  selectors: {
    ['&[data-no-terminal="true"]::before']: {
      display: 'none',
    },
  },
});
