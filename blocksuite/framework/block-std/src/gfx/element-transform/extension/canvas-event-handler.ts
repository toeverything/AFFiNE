import { Bound } from '@blocksuite/global/gfx';
import last from 'lodash-es/last';

import type { PointerEventState } from '../../../event';
import type { GfxController } from '../..';
import type { GfxElementModelView } from '../../view/view';

export class CanvasEventHandler {
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

  constructor(private readonly gfx: GfxController) {}

  click(_evt: PointerEventState): void {
    last(this._currentStackedElm)?.dispatch('click', _evt);
  }

  dblClick(_evt: PointerEventState): void {
    last(this._currentStackedElm)?.dispatch('dblclick', _evt);
  }

  pointerDown(_evt: PointerEventState): void {
    last(this._currentStackedElm)?.dispatch('pointerdown', _evt);
  }

  pointerMove(_evt: PointerEventState): void {
    const [x, y] = this.gfx.viewport.toModelCoord(_evt.x, _evt.y);
    const hoveredElmViews = this.gfx.grid
      .search(new Bound(x - 5, y - 5, 10, 10), {
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

  pointerUp(_evt: PointerEventState): void {
    last(this._currentStackedElm)?.dispatch('pointerup', _evt);
  }
}
