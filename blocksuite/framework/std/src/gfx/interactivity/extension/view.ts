import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

import type { BlockStdScope } from '../../../scope';
import type { GfxBlockComponent } from '../../../view';
import type { GfxController, GfxModel } from '../..';
import type { GfxElementModelView } from '../../view/view';
import type {
  BeforeResizeContext,
  BeforeRotateContext,
  ResizeConstraint,
  ResizeEndContext,
  ResizeMoveContext,
  ResizeStartContext,
  RotateEndContext,
  RotateMoveContext,
  RotateStartContext,
  SelectableContext,
  SelectContext,
} from '../types/view';

type ExtendedViewContext<
  T extends GfxBlockComponent | GfxElementModelView,
  Context,
  DefaultReturnType = void,
> = {
  /**
   * The default function of the interaction.
   * If the interaction is handled by the extension, the default function will not be executed.
   * But extension can choose to call the default function by `context.default(context)` if needed.
   */
  default: (context: Context) => DefaultReturnType;

  model: T['model'];

  view: T;
};

type ViewInteractionHandleContext<
  T extends GfxBlockComponent | GfxElementModelView,
> = {
  std: BlockStdScope;
  gfx: GfxController;
  view: T;
  model: T['model'];

  /**
   * Used to add an element to resize list.
   * @param model
   */
  add(element: GfxModel): void;

  /**
   * Used to remove an element from resize list.
   * @param element
   */
  delete(element: GfxModel): void;
};

export type GfxViewInteractionConfig<
  T extends GfxBlockComponent | GfxElementModelView =
    | GfxBlockComponent
    | GfxElementModelView,
> = {
  readonly resizeConstraint?: ResizeConstraint;

  /**
   * The function that will be called when the view is resized.
   * You can add or delete the resize element before resize starts in this function.,
   * And return handlers to customize the resize behavior.
   * @param context
   * @returns
   */
  handleResize?: (context: ViewInteractionHandleContext<T>) => {
    /**
     * Called before resize starts. When this method is called, the resize elements are confirmed and will not be changed.
     * You can set the resize constraint in this method.
     * @param context
     * @returns
     */
    beforeResize?: (context: BeforeResizeContext) => void;
    onResizeStart?(
      context: ResizeStartContext & ExtendedViewContext<T, ResizeStartContext>
    ): void;
    onResizeMove?(
      context: ResizeMoveContext & ExtendedViewContext<T, ResizeMoveContext>
    ): void;
    onResizeEnd?(
      context: ResizeEndContext & ExtendedViewContext<T, ResizeEndContext>
    ): void;
  };

  handleRotate?: (context: ViewInteractionHandleContext<T>) => {
    beforeRotate?: (context: BeforeRotateContext) => void;
    onRotateStart?(
      context: RotateStartContext & ExtendedViewContext<T, RotateStartContext>
    ): void;
    onRotateMove?(
      context: RotateMoveContext & ExtendedViewContext<T, RotateMoveContext>
    ): void;
    onRotateEnd?(
      context: RotateEndContext & ExtendedViewContext<T, RotateEndContext>
    ): void;
  };

  handleSelection?: (
    context: Omit<ViewInteractionHandleContext<T>, 'add' | 'delete'>
  ) => {
    selectable?: (
      context: SelectableContext &
        ExtendedViewContext<T, SelectableContext, boolean>
    ) => boolean;
    onSelect?: (
      context: SelectContext &
        ExtendedViewContext<T, SelectContext, boolean | void>
    ) => boolean | void;
  };
};

export const GfxViewInteractionIdentifier =
  createIdentifier<GfxViewInteractionConfig>('GfxViewInteraction');

export function GfxViewInteractionExtension<
  T extends GfxBlockComponent | GfxElementModelView,
>(viewType: string, config: GfxViewInteractionConfig<T>): ExtensionType {
  return {
    setup(di) {
      di.addImpl(
        GfxViewInteractionIdentifier(viewType),
        () => config as GfxViewInteractionConfig
      );
    },
  };
}
