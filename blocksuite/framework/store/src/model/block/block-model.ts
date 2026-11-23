import type { Disposable } from '@blocksuite/global/disposable';
import { computed, type Signal, signal } from '@preact/signals-core';
import { Subject } from 'rxjs';
import { take } from 'rxjs/operators';

import type { Text } from '../../reactive/index.js';
import type { Store } from '../store/store.js';
import type { YBlock } from './types.js';
import type { BlockSchemaType } from './zod.js';

type SignaledProps<Props> = Props & {
  [P in keyof Props & string as `${P}$`]: Signal<Props[P]>;
};

const modelLabel = Symbol('model_label');

export class BlockModel<Props extends object = object> {
  private readonly _children = signal<string[]>([]);

  private _store!: Store;

  private readonly _childModels = computed(() => {
    const value: BlockModel[] = [];
    this._children.value.forEach(id => {
      const block = this._store.getBlock$(id);
      if (block) {
        value.push(block.model);
      }
    });
    return value;
  });

  private readonly _onCreated: Disposable;

  private readonly _onDeleted: Disposable;

  childMap = computed(() =>
    this._children.value.reduce((map, id, index) => {
      map.set(id, index);
      return map;
    }, new Map<string, number>())
  );

  created = new Subject<void>();

  deleted = new Subject<void>();

  id!: string;

  schema!: BlockSchemaType;

  isEmpty() {
    return this.children.length === 0;
  }

  keys!: string[];

  // This is used to avoid https://stackoverflow.com/questions/55886792/infer-typescript-generic-class-type
  [modelLabel]: Props = 'type_info_label' as never;

  pop!: (prop: keyof Props & string) => void;

  propsUpdated = new Subject<{ key: string }>();

  stash!: (prop: keyof Props & string) => void;

  get text(): Text | undefined {
    return (this.props as { text?: Text }).text;
  }

  set text(text: Text) {
    if (this.keys.includes('text')) {
      (this.props as { text?: Text }).text = text;
    }
  }

  yBlock!: YBlock;

  _props!: SignaledProps<Props>;

  get props() {
    if (!this._props) {
      throw new Error('props is only supported in flat data model');
    }
    return this._props;
  }

  get flavour(): string {
    return this.schema.model.flavour;
  }

  get version() {
    return this.schema.version;
  }

  get children() {
    return this._childModels.value;
  }

  get store() {
    return this._store;
  }

  set store(doc: Store) {
    this._store = doc;
  }

  get parent() {
    return this.store.getParent(this);
  }

  get role() {
    return this.schema.model.role;
  }

  constructor() {
    this._onCreated = {
      dispose: this.created.pipe(take(1)).subscribe(() => {
        this._children.value = this.yBlock.get('sys:children').toArray();
        this.yBlock.get('sys:children').observe(event => {
          this._children.value = event.target.toArray();
        });
        this.yBlock.observe(event => {
          if (event.keysChanged.has('sys:children')) {
            this._children.value = this.yBlock.get('sys:children').toArray();
          }
        });
      }).unsubscribe,
    };
    this._onDeleted = {
      dispose: this.deleted.pipe(take(1)).subscribe(() => {
        this._onCreated.dispose();
      }).unsubscribe,
    };
  }

  dispose() {
    this.created.complete();
    this.deleted.complete();
    this.propsUpdated.complete();
  }

  firstChild(): BlockModel | null {
    return this.children[0] || null;
  }

  lastChild(): BlockModel | null {
    if (!this.children.length) {
      return this;
    }
    return this.children[this.children.length - 1].lastChild();
  }

  [Symbol.dispose]() {
    this._onCreated.dispose();
    this._onDeleted.dispose();
  }
}
