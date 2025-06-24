import { Bound } from '@blocksuite/global/gfx';
import last from 'lodash-es/last';

import type { PointerEventState } from '../../event';
import type { GfxController } from '../controller.js';
import type { GfxElementModelView, SupportedEvent } from '../view/view.js';

export class GfxViewEventManager {
  private _hoveredElementsStack: GfxElementModelView[] = [];
  private _draggingElement: GfxElementModelView | null = null;

  private _callInReverseOrder(
    callback: (view: GfxElementModelView) => void,
    arr = this._hoveredElementsStack
  ) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const view = arr[i];

      callback(view);
    }
  }

  constructor(private readonly gfx: GfxController) {}

  dispatch(eventName: SupportedEvent, evt: PointerEventState) {
    if (eventName === 'pointermove') {
      this._handlePointerMove(evt);
      return false;
    } else if (eventName.startsWith('drag')) {
      return this._handleDrag(
        eventName as 'dragstart' | 'dragend' | 'dragmove',
        evt
      );
    } else {
      return last(this._hoveredElementsStack)?.dispatch(eventName, evt);
    }
  }

  private _handleDrag(
    evtName: 'dragstart' | 'dragend' | 'dragmove',
    _evt: PointerEventState
  ): boolean {
    switch (evtName) {
      case 'dragstart': {
        if (this._draggingElement) {
          this._draggingElement.dispatch('dragend', _evt);
        }
        this._draggingElement = last(this._hoveredElementsStack) ?? null;
        return this._draggingElement?.dispatch('dragstart', _evt) ?? false;
      }
      case 'dragmove': {
        return this._draggingElement?.dispatch('dragmove', _evt) ?? false;
      }
      case 'dragend': {
        const dispatched =
          this._draggingElement?.dispatch('dragend', _evt) ?? false;
        this._draggingElement = null;
        return dispatched;
      }
    }
  }

  private _handlePointerMove(_evt: PointerEventState): void {
    const [x, y] = this.gfx.viewport.toModelCoord(_evt.x, _evt.y);
    const hoveredElmViews = this.gfx.grid
      .search(new Bound(x - 5, y - 5, 10, 10), {
        filter: ['canvas', 'local'],
      })
      .reduce((pre, model) => {
        if (
          model.includesPoint(
            x,
            y,
            {
              hitThreshold: 10,
              responsePadding: [5, 5],
            },
            this.gfx.std.host
          ) ||
          ('externalBound' in model
            ? model.externalBound?.isPointInBound([x, y])
            : false)
        ) {
          const view = this.gfx.view.get(model) as GfxElementModelView | null;

          view && pre.push(view);
        }

        return pre;
      }, [] as GfxElementModelView[]);

    const currentStackedViews = new Set(this._hoveredElementsStack);
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
    this._hoveredElementsStack = hoveredElmViews;
  }
}
