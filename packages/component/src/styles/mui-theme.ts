import '@emotion/react';

import type {
  Breakpoint,
  BreakpointsOptions,
  ThemeOptions,
} from '@mui/material';

export const muiThemes = {
  breakpoints: {
    values: {
      xs: 0,
      sm: 640,
      md: 960,
      lg: 1280,
      xl: 1920,
    },
  },
} satisfies ThemeOptions;

// Ported from mui
// See https://github.com/mui/material-ui/blob/eba90da5359ff9c58b02800dfe468dc6c0b95bd2/packages/mui-system/src/createTheme/createBreakpoints.js
// License under MIT
function createBreakpoints(breakpoints: BreakpointsOptions): Readonly<
  Omit<BreakpointsOptions, 'up' | 'down'> & {
    up: (key: Breakpoint | number, pure?: boolean) => string;
    down: (key: Breakpoint | number, pure?: boolean) => string;
  }
> {
  const {
    // The breakpoint **start** at this value.
    // For instance with the first breakpoint xs: [xs, sm).
    values = {
      xs: 0, // phone
      sm: 600, // tablet
      md: 900, // small laptop
      lg: 1200, // desktop
      xl: 1536, // large screen
    },
    unit = 'px',
    step = 5,
    ...other
  } = breakpoints;

  const keys = Object.keys(values) as ['xs', 'sm', 'md', 'lg', 'xl'];

  function up(key: Breakpoint | number, pure = false) {
    const value = typeof key === 'number' ? key : values[key];
    const original = `(min-width:${value}${unit})`;
    if (pure) {
      return original;
    }
    return `@media ${original}`;
  }

  function down(key: Breakpoint | number, pure = false) {
    const value = typeof key === 'number' ? key : values[key];
    const original = `(max-width:${value - step / 100}${unit})`;
    if (pure) {
      return original;
    }
    return `@media ${original}`;
  }

  return {
    keys,
    values,
    up,
    down,
    unit,
    // between,
    // only,
    // not,
    ...other,
  };
}

/**
 * @example
 * ```ts
 * export const iconButtonStyle = style({
 *   [breakpoints.up('sm')]: {
 *     padding: '6px'
 *   },
 * });
 * ```
 */
export const breakpoints = createBreakpoints(muiThemes.breakpoints);
