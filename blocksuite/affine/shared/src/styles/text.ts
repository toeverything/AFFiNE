import type { StyleInfo } from 'lit/directives/style-map.js';

import type { AffineTextAttributes } from '../types';

export function affineTextStyles(
  props: AffineTextAttributes,
  override?: Readonly<StyleInfo>
): StyleInfo {
  let textDecorations = '';
  if (props.underline) {
    textDecorations += 'underline';
  }
  if (props.strike) {
    textDecorations += ' line-through';
  }

  let inlineCodeStyle = {};
  if (props.code) {
    inlineCodeStyle = {
      'font-family': 'var(--affine-font-code-family)',
      background: 'var(--affine-background-code-block)',
      border: '1px solid var(--affine-border-color)',
      'border-radius': '4px',
      color: 'var(--affine-text-primary-color)',
      'font-variant-ligatures': 'none',
      'vertical-align': 'bottom',
      'line-height': 'inherit',
    };
  }

  // highlight: Obsidian ==text== attribute; uses token or CSS colour value.
  // Falls back to background if both are set (background takes precedence for explicit colour picker usage).
  const resolvedBackground =
    props.background ?? (props.highlight ? props.highlight : undefined);

  return {
    'font-weight': props.bold ? 'bolder' : 'inherit',
    'font-style': props.italic ? 'italic' : 'normal',
    'background-color': resolvedBackground,
    color: props.color ? props.color : undefined,
    'text-decoration': textDecorations.length > 0 ? textDecorations : 'none',
    ...inlineCodeStyle,
    ...override,
  };
}
