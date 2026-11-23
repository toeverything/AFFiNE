import type { Placement } from '@floating-ui/dom';

import type { ToolbarActions } from './action';
import type { ToolbarContext } from './context';

export type ToolbarPlacement =
  | Extract<Placement, 'top' | 'top-start'>
  | 'inner';

export type ToolbarModuleConfig = {
  actions: ToolbarActions;

  when?: ((ctx: ToolbarContext) => boolean) | boolean;

  placement?: ToolbarPlacement;
};
