import * as icons from '@blocksuite/icons/lit';
import type { TemplateResult } from 'lit';

import type { IconValue } from './define.js';

/** Same shape the callout block renders, so an icon looks the same anywhere. */
export const renderIconValue = (
  icon: IconValue | undefined
): TemplateResult | string | null => {
  if (!icon) return null;
  if (icon.type === 'emoji') return icon.unicode ?? null;
  if (icon.type === 'affine-icon' && icon.name) {
    return (
      (icons as Record<string, (props: { style: string }) => TemplateResult>)[
        `${icon.name}Icon`
      ]?.({
        style: `color:${icon.color ?? 'currentColor'}`,
      }) ?? null
    );
  }
  return null;
};
