/* CSS variables. You need to handle all places where `CSS variables` are marked. */

import { LINE_COLORS } from '@blocksuite/affine-model';
import {
  type AffineCssVariables,
  type AffineTheme,
  cssVar,
} from '@toeverything/theme';
export { cssVar } from '@toeverything/theme';
import { type AffineThemeKeyV2, cssVarV2 } from '@toeverything/theme/v2';
import { unsafeCSS } from 'lit';
export { cssVarV2 } from '@toeverything/theme/v2';
export const ColorVariables = [
  '--affine-brand-color',
  '--affine-primary-color',
  '--affine-secondary-color',
  '--affine-tertiary-color',
  '--affine-hover-color',
  '--affine-icon-color',
  '--affine-icon-secondary',
  '--affine-border-color',
  '--affine-divider-color',
  '--affine-placeholder-color',
  '--affine-quote-color',
  '--affine-link-color',
  '--affine-edgeless-grid-color',
  '--affine-success-color',
  '--affine-warning-color',
  '--affine-error-color',
  '--affine-processing-color',
  '--affine-text-emphasis-color',
  '--affine-text-primary-color',
  '--affine-text-secondary-color',
  '--affine-text-disable-color',
  '--affine-black-10',
  '--affine-black-30',
  '--affine-black-50',
  '--affine-black-60',
  '--affine-black-80',
  '--affine-black-90',
  '--affine-black',
  '--affine-white-10',
  '--affine-white-30',
  '--affine-white-50',
  '--affine-white-60',
  '--affine-white-80',
  '--affine-white-90',
  '--affine-white',
  '--affine-background-code-block',
  '--affine-background-tertiary-color',
  '--affine-background-processing-color',
  '--affine-background-error-color',
  '--affine-background-warning-color',
  '--affine-background-success-color',
  '--affine-background-primary-color',
  '--affine-background-secondary-color',
  '--affine-background-modal-color',
  '--affine-background-overlay-panel-color',
  '--affine-tag-blue',
  '--affine-tag-green',
  '--affine-tag-teal',
  '--affine-tag-white',
  '--affine-tag-purple',
  '--affine-tag-red',
  '--affine-tag-pink',
  '--affine-tag-yellow',
  '--affine-tag-orange',
  '--affine-tag-gray',
  ...LINE_COLORS,
  '--affine-tooltip',
  '--affine-blue',
];

export const SizeVariables = [
  '--affine-font-h-1',
  '--affine-font-h-2',
  '--affine-font-h-3',
  '--affine-font-h-4',
  '--affine-font-h-5',
  '--affine-font-h-6',
  '--affine-font-base',
  '--affine-font-sm',
  '--affine-font-xs',
  '--affine-line-height',
  '--affine-z-index-modal',
  '--affine-z-index-popover',
];

export const FontFamilyVariables = [
  '--affine-font-family',
  '--affine-font-number-family',
  '--affine-font-code-family',
];

export const StyleVariables = [
  '--affine-editor-width',

  '--affine-theme-mode',
  '--affine-editor-mode',
  /* --affine-palette-transparent: special values added for the sake of logical consistency. */
  '--affine-palette-transparent',

  '--affine-popover-shadow',
  '--affine-menu-shadow',
  '--affine-float-button-shadow',
  '--affine-shadow-1',
  '--affine-shadow-2',
  '--affine-shadow-3',

  '--affine-paragraph-space',
  '--affine-popover-radius',
  '--affine-scale',
  ...SizeVariables,
  ...ColorVariables,
  ...FontFamilyVariables,
] as const;

type VariablesType = typeof StyleVariables;
export type CssVariableName = Extract<
  VariablesType[keyof VariablesType],
  string
>;

export type CssVariablesMap = Record<CssVariableName, string>;

export const unsafeCSSVar = (
  key: keyof AffineCssVariables | keyof AffineTheme,
  fallback?: string
) => unsafeCSS(cssVar(key, fallback));

export const unsafeCSSVarV2 = (key: AffineThemeKeyV2, fallback?: string) =>
  unsafeCSS(cssVarV2(key, fallback));
