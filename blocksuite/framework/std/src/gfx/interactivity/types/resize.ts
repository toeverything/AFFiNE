import type { IBound, IPoint, IVec } from '@blocksuite/global/gfx';

import type { GfxModel } from '../../model/model';
import type { ResizeHandle } from '../resize/manager';

export type ExtensionElementResizeContext = {
  elements: GfxModel[];
};

export type ExtensionElementResizeStartContext = {
  elements: GfxModel[];

  /**
   * The position of the handle in the browser coordinate space.
   */
  handlePos: IVec;

  /**
   * The sign (or normal vector) of the handle.
   */
  handleSign: IPoint;

  handle: ResizeHandle;
};

export type ExtensionElementResizeEndContext =
  ExtensionElementResizeStartContext;

export type ExtensionElementResizeMoveContext =
  ExtensionElementResizeStartContext & {
    scaleX: number;
    scaleY: number;

    originalBound: IBound;

    currentHandlePos: IVec;

    lockRatio: boolean;

    suggest: (distance: { scaleX: number; scaleY: number }) => void;
  };
