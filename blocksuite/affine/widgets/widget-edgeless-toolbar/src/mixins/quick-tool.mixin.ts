import type { Constructor } from '@blocksuite/global/utils';
import type { LitElement } from 'lit';

import {
  // oxlint-disable-next-line no-unused-vars
  type EdgelessToolbarToolClass,
  EdgelessToolbarToolMixin,
} from './tool.mixin.js';

export declare abstract class QuickToolMixinClass extends EdgelessToolbarToolClass {}

/**
 * Mixin for quick tool item.
 */
export const QuickToolMixin = <T extends Constructor<LitElement>>(
  SuperClass: T
) => {
  abstract class DerivedClass extends EdgelessToolbarToolMixin(SuperClass) {}

  return DerivedClass as unknown as T & Constructor<QuickToolMixinClass>;
};
