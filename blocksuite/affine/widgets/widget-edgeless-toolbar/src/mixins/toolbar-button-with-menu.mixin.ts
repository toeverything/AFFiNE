import type { Constructor } from '@blocksuite/global/utils';
import type { LitElement } from 'lit';

import {
  // oxlint-disable-next-line no-unused-vars
  type EdgelessToolbarToolClass,
  EdgelessToolbarToolMixin,
} from './tool.mixin.js';

export declare abstract class ToolbarButtonWithMenuClass extends EdgelessToolbarToolClass {}

export const ToolbarButtonWithMenuMixin = <
  T extends Constructor<LitElement> = Constructor<LitElement>,
>(
  SuperClass: T
) => {
  abstract class DerivedClass extends EdgelessToolbarToolMixin(SuperClass) {}

  return DerivedClass as unknown as T & Constructor<ToolbarButtonWithMenuClass>;
};
