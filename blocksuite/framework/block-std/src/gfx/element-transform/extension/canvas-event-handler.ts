import { Bound } from '@blocksuite/global/gfx';
import last from 'lodash-es/last';

import type { PointerEventState } from '../../../event';
import type { GfxElementModelView } from '../../view/view';
import { TransformExtension } from '../transform-manager';

export class CanvasEventHandler extends TransformExtension {
  static override key = 'canvas-event-handler';

  private _currentStackedElm: GfxElementModelView[] = [];

  private _callInReverseOrder(
    callback: (view: GfxElementModelView) => void,
    arr = this._currentStackedElm
  ) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const view = arr[i];

      callback(view);
    }
  }

  override click(_evt: PointerEventState): void {
    last(this._currentStackedElm)?.dispatch('click', _evt);
  }

  override dblClick(_evt: PointerEventState): void {
    last(this._currentStackedElm)?.dispatch('dblclick', _evt);
  }

  override pointerDown(_evt: PointerEventState): void {
    last(this._currentStackedElm)?.dispatch('pointerdown', _evt);
  }

  override pointerMove(_evt: PointerEventState): void {
    const [x, y] = this.gfx.viewport.toModelCoord(_evt.x, _evt.y);
    const hoveredElmViews = this.gfx.grid
      .search(new Bound(x, y, 1, 1), {
        filter: ['canvas', 'local'],
      })
      .map(model => this.gfx.view.get(model)) as GfxElementModelView[];
    const currentStackedViews = new Set(this._currentStackedElm);
    const visited = new Set<GfxElementModelView>();

    this._callInReverseOrder(view => {
      if (currentStackedViews.has(view)) {
        visited.add(view);
        view.dispatch('pointermove', _evt);
      } else {
        view.dispatch('pointerenter', _evt);
      }
    }, hoveredElmViews);
    this._callInReverseOrder(
      view => !visited.has(view) && view.dispatch('pointerleave', _evt)
    );
    this._currentStackedElm = hoveredElmViews;
  }

  override pointerUp(_evt: PointerEventState): void {
    last(this._currentStackedElm)?.dispatch('pointerup', _evt);
  }
}
