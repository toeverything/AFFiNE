import type { SerializedXYWH } from '@blocksuite/global/gfx';

import {
  convert,
  derive,
  field,
  GfxLocalElementModel,
  GfxPrimitiveElementModel,
} from '../gfx/index.js';

export class TestShapeElement extends GfxPrimitiveElementModel {
  get type() {
    return 'testShape';
  }

  @field()
  accessor rotate: number = 0;

  @field()
  accessor xywh: SerializedXYWH = '[0,0,10,10]';

  @convert(val => {
    if (['rect', 'triangle'].includes(val)) {
      return val;
    }

    return 'rect';
  })
  @derive(val => {
    if (val === 'triangle') {
      return {
        rotate: 0,
      };
    }

    return {};
  })
  @field()
  accessor shapeType: 'rect' | 'triangle' = 'rect';
}

export class TestLocalElement extends GfxLocalElementModel {
  override type: string = 'testLocal';
}
