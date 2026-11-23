import { Subject } from 'rxjs';

import { LifeCycleWatcher } from '../extension/index.js';
import type { BlockComponent, WidgetComponent } from './element/index.js';

type ViewUpdateMethod = 'delete' | 'add';

export type ViewUpdatePayload =
  | {
      id: string;
      method: ViewUpdateMethod;
      type: 'block';
      view: BlockComponent;
    }
  | {
      id: string;
      method: ViewUpdateMethod;
      type: 'widget';
      view: WidgetComponent;
    };

export class ViewStore extends LifeCycleWatcher {
  static override readonly key = 'viewStore';

  private readonly _blockMap = new Map<string, BlockComponent>();

  viewUpdated: Subject<ViewUpdatePayload> = new Subject();

  get views() {
    return Array.from(this._blockMap.values());
  }

  private readonly _fromId = (
    blockId: string | undefined | null
  ): BlockComponent | null => {
    const id = blockId ?? this.std.store.root?.id;
    if (!id) {
      return null;
    }
    return this._blockMap.get(id) ?? null;
  };

  private readonly _widgetMap = new Map<string, WidgetComponent>();

  deleteBlock = (node: BlockComponent) => {
    this._blockMap.delete(node.model.id);
    this.viewUpdated.next({
      id: node.model.id,
      method: 'delete',
      type: 'block',
      view: node,
    });
  };

  deleteWidget = (node: WidgetComponent) => {
    const id = node.dataset.widgetId as string;
    const widgetIndex = `${node.model.id}|${id}`;
    this._widgetMap.delete(widgetIndex);
    this.viewUpdated.next({
      id: node.model.id,
      method: 'delete',
      type: 'widget',
      view: node,
    });
  };

  getBlock = (id: string): BlockComponent | null => {
    return this._blockMap.get(id) ?? null;
  };

  getWidget = (
    widgetName: string,
    hostBlockId: string
  ): WidgetComponent | null => {
    const widgetIndex = `${hostBlockId}|${widgetName}`;
    return this._widgetMap.get(widgetIndex) ?? null;
  };

  setBlock = (node: BlockComponent) => {
    if (this._blockMap.has(node.model.id)) {
      this.deleteBlock(node);
    }
    this._blockMap.set(node.model.id, node);
    this.viewUpdated.next({
      id: node.model.id,
      method: 'add',
      type: 'block',
      view: node,
    });
  };

  setWidget = (node: WidgetComponent) => {
    const id = node.dataset.widgetId as string;
    const widgetIndex = `${node.model.id}|${id}`;
    this._widgetMap.set(widgetIndex, node);
    this.viewUpdated.next({
      id: node.model.id,
      method: 'add',
      type: 'widget',
      view: node,
    });
  };

  walkThrough = (
    fn: (
      nodeView: BlockComponent,
      index: number,
      parent: BlockComponent
    ) => undefined | null | true,
    blockId?: string | undefined | null
  ) => {
    const top = this._fromId(blockId);
    if (!top) {
      return;
    }

    const iterate =
      (parent: BlockComponent) => (node: BlockComponent, index: number) => {
        const result = fn(node, index, parent);
        if (result === true) {
          return;
        }
        const children = node.model.children;
        children.forEach(child => {
          const childNode = this._blockMap.get(child.id);
          if (childNode) {
            iterate(node)(childNode, children.indexOf(child));
          }
        });
      };

    top.model.children.forEach(child => {
      const childNode = this._blockMap.get(child.id);
      if (childNode) {
        iterate(childNode)(childNode, top.model.children.indexOf(child));
      }
    });
  };

  override unmounted() {
    this._blockMap.clear();
    this._widgetMap.clear();
    this.viewUpdated.complete();
  }
}
