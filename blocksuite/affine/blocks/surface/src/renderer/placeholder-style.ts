import { type ColorScheme } from '@blocksuite/affine-model';
import { getAffinePlaceholderFillColor } from '@blocksuite/affine-shared/theme';

export function getSurfacePlaceholderFallback(colorScheme: ColorScheme) {
  return getAffinePlaceholderFillColor(colorScheme);
}

export function resolveSurfacePlaceholderColor(colorScheme: ColorScheme) {
  return getSurfacePlaceholderFallback(colorScheme);
}
