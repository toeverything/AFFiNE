import { CommandManager, type EditorHost } from '@blocksuite/std';
import type { Block, Store } from '@blocksuite/store';
import { Subject } from 'rxjs';

interface MockBlockComponent {
  id: string;
  model: Block;
  flavour: string;
  role: string;
  parentElement: MockBlockComponent | null;
  closest: (selector: string) => MockBlockComponent | null;
  querySelector: (selector: string) => MockBlockComponent | null;
  querySelectorAll: (selector: string) => MockBlockComponent[];
  children: MockBlockComponent[];
}

type ViewUpdateMethod = 'delete' | 'add';
type ViewUpdatePayload = {
  id: string;
  method: ViewUpdateMethod;
  type: 'block';
  view: MockBlockComponent;
};

/**
 * Mock selection class for testing
 */
class MockSelectionStore {
  private _selections: any[] = [];

  constructor() {}

  get value() {
    return this._selections;
  }

  create(selectionClass: any, ...args: any[]) {
    return new selectionClass(...args);
  }

  setGroup(group: string, selections: any[]) {
    this._selections = this._selections.filter(s => s.group !== group);
    this._selections.push(...selections);
    return this;
  }

  set(selections: any[]) {
    this._selections = selections;
    return this;
  }

  find(type: any) {
    return this._selections.find(s => s instanceof type);
  }

  filter(type: any) {
    return this._selections.filter(s => s instanceof type);
  }

  clear() {
    this._selections = [];
    return this;
  }

  slots = {
    changed: {
      emit: () => {},
    },
    remoteChanged: {
      emit: () => {},
    },
  };

  dispose() {
    this._selections = [];
  }
}

class MockViewStore {
  private readonly _blockMap = new Map<string, MockBlockComponent>();
  viewUpdated = new Subject<ViewUpdatePayload>();

  constructor(private readonly doc: Store) {}

  get views() {
    return Array.from(this._blockMap.values());
  }

  deleteBlock(node: MockBlockComponent) {
    this._blockMap.delete(node.model.id);
    this.viewUpdated.next({
      id: node.model.id,
      method: 'delete',
      type: 'block',
      view: node,
    });
  }

  getBlock(id: string): MockBlockComponent | null {
    if (this._blockMap.has(id)) {
      return this._blockMap.get(id) || null;
    }

    const block = this.doc.getBlock(id);
    if (!block) return null;

    const mockComponent = this._createMockBlockComponent(block);
    this._blockMap.set(id, mockComponent);

    return mockComponent;
  }

  setBlock(node: MockBlockComponent) {
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
  }

  private _createMockBlockComponent(block: Block): MockBlockComponent {
    const role = this._determineBlockRole(block);

    const mockComponent: MockBlockComponent = {
      id: block.id,
      model: block,
      flavour: block.flavour,
      role,
      parentElement: null,
      children: [],
      closest: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    };

    this._setupParentChildRelationships(mockComponent);

    return mockComponent;
  }

  private _determineBlockRole(block: Block): string {
    if (
      block.flavour.includes('paragraph') ||
      block.flavour.includes('list') ||
      block.flavour.includes('list-item') ||
      block.flavour.includes('text')
    ) {
      return 'content';
    }
    return 'root';
  }

  private _setupParentChildRelationships(component: MockBlockComponent) {
    const parentId = (component.model as any).parentId;
    if (parentId) {
      const parentComponent = this.getBlock(parentId);
      if (parentComponent) {
        component.parentElement = parentComponent;

        if (
          !parentComponent.children.find(child => child.id === component.id)
        ) {
          parentComponent.children.push(component);
        }
      }
    }

    try {
      const childIds =
        (component.model as any).children?.map((child: any) =>
          typeof child === 'string' ? child : child.id
        ) || [];

      for (const childId of childIds) {
        const childBlock = this.doc.getBlock(childId);
        if (childBlock) {
          const childComponent =
            this.getBlock(childId) ||
            this._createMockBlockComponent(childBlock);
          if (
            !component.children.find(child => child.id === childComponent.id)
          ) {
            component.children.push(childComponent);
            childComponent.parentElement = component;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  dispose() {
    this._blockMap.clear();
  }
}

/**
 * Create a test host object
 *
 * This function creates a mock host object that includes doc and command properties,
 * which can be used for testing command execution.
 *
 * Usage:
 * ```typescript
 * const doc = affine`<affine-page></affine-page>`;
 * const host = createTestHost(doc);
 *
 * // Use host.command.exec to execute commands
 * const [_, result] = host.command.exec(someCommand, {
 *   // command params
 * });
 * ```
 *
 * @param doc Document object
 * @returns Host object containing doc and command
 */
export function createTestHost(doc: Store): EditorHost {
  const std = {
    host: undefined as any,
    view: new MockViewStore(doc),
    command: undefined as any,
    selection: undefined as any,
  };

  const host = {
    store: doc,
    std: std as any,
    selection: undefined as any,
  };
  host.store = doc;
  host.std = std as any;

  std.host = host;
  std.selection = new MockSelectionStore();

  std.command = new CommandManager(std as any);
  // @ts-expect-error dev-only
  host.command = std.command;
  host.selection = std.selection;

  return host as EditorHost;
}
