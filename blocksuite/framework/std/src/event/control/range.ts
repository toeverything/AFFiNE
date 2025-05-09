import type { BlockComponent } from '../../view/index.js';
import { UIEventState, UIEventStateContext } from '../base.js';
import type {
  EventHandlerRunner,
  EventName,
  UIEventDispatcher,
} from '../dispatcher.js';
import { EventScopeSourceType, EventSourceState } from '../state/source.js';

export class RangeControl {
  private readonly _buildScope = (eventName: EventName) => {
    let scope: EventHandlerRunner[] | undefined;
    const selection = document.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      scope = this._buildEventScopeByNativeRange(eventName, range);
      this._prev = range;
    } else if (this._prev !== null) {
      scope = this._buildEventScopeByNativeRange(eventName, this._prev);
      this._prev = null;
    }

    return scope;
  };

  private readonly _compositionEnd = (event: Event) => {
    const scope = this._buildScope('compositionEnd');

    this._dispatcher.run('compositionEnd', this._createContext(event), scope);
  };

  private readonly _compositionStart = (event: Event) => {
    const scope = this._buildScope('compositionStart');

    this._dispatcher.run('compositionStart', this._createContext(event), scope);
  };

  private readonly _compositionUpdate = (event: Event) => {
    const scope = this._buildScope('compositionUpdate');

    this._dispatcher.run(
      'compositionUpdate',
      this._createContext(event),
      scope
    );
  };

  private _prev: Range | null = null;

  private readonly _selectionChange = (event: Event) => {
    const selection = document.getSelection();
    if (!selection) return;

    if (!selection.containsNode(this._dispatcher.host, true)) return;
    if (selection.containsNode(this._dispatcher.host)) return;

    const scope = this._buildScope('selectionChange');

    this._dispatcher.run('selectionChange', this._createContext(event), scope);
  };

  constructor(private readonly _dispatcher: UIEventDispatcher) {}

  private _buildEventScopeByNativeRange(name: EventName, range: Range) {
    const blockIds = this._findBlockComponentPath(range);

    return this._dispatcher.buildEventScope(name, blockIds);
  }

  private _createContext(event: Event) {
    return UIEventStateContext.from(
      new UIEventState(event),
      new EventSourceState({
        event,
        sourceType: EventScopeSourceType.Selection,
      })
    );
  }

  private _findBlockComponentPath(range: Range): string[] {
    const start = range.startContainer;
    const end = range.endContainer;
    const ancestor = range.commonAncestorContainer;
    const getBlockView = (node: Node): BlockComponent | null => {
      const el = node instanceof Element ? node : node.parentElement;
      // TODO(mirone/#6534): find a better way to get block element from a node
      return el?.closest<BlockComponent>('[data-block-id]') ?? null;
    };
    if (ancestor.nodeType === Node.TEXT_NODE) {
      const leaf = getBlockView(ancestor);
      if (leaf) {
        return [leaf.blockId];
      }
    }
    const nodes = new Set<Node>();

    let startRecorded = false;
    const dfsDOMSearch = (current: Node | null, ancestor: Node) => {
      if (!current) {
        return;
      }
      if (current === ancestor) {
        return;
      }
      if (current === end) {
        nodes.add(current);
        startRecorded = false;
        return;
      }
      if (current === start) {
        startRecorded = true;
      }
      // eslint-disable-next-line sonarjs/no-collapsible-if
      if (startRecorded) {
        if (
          current.nodeType === Node.TEXT_NODE ||
          current.nodeType === Node.ELEMENT_NODE
        ) {
          nodes.add(current);
        }
      }
      dfsDOMSearch(current.firstChild, ancestor);
      dfsDOMSearch(current.nextSibling, ancestor);
    };
    dfsDOMSearch(ancestor.firstChild, ancestor);

    const blocks = new Set<string>();
    nodes.forEach(node => {
      const blockView = getBlockView(node);
      if (!blockView) {
        return;
      }
      if (blocks.has(blockView.blockId)) {
        return;
      }
      blocks.add(blockView.blockId);
    });
    return Array.from(blocks);
  }

  listen() {
    const { host, disposables } = this._dispatcher;
    disposables.addFromEvent(
      document,
      'selectionchange',
      this._selectionChange
    );
    disposables.addFromEvent(host, 'compositionstart', this._compositionStart);
    disposables.addFromEvent(host, 'compositionend', this._compositionEnd);
    disposables.addFromEvent(
      host,
      'compositionupdate',
      this._compositionUpdate
    );
  }
}
