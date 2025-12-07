/**
 * CSS variable resolution utilities
 */

const rootComputedStyle =
  typeof document !== 'undefined'
    ? getComputedStyle(document.documentElement)
    : null;

/**
 * Resolve CSS variable color (var(--affine-xxx)) using computed styles
 */
export function resolveCssVariable(color: string): string | null {
  if (!color || typeof color !== 'string') {
    return null;
  }
  if (!color.startsWith('var(')) {
    return color;
  }
  if (!rootComputedStyle) {
    return null;
  }
  const match = color.match(/var\(([^)]+)\)/);
  if (!match || !match[1]) {
    return null;
  }
  const variable = match[1].trim();
  if (!variable.startsWith('--')) {
    return null;
  }
  const value = rootComputedStyle.getPropertyValue(variable).trim();
  return value || null;
}
