import {
    AbstractType as YAbstractType,
    Array as YArray,
    Map as YMap,
    transact,
} from 'yjs';

import { BlockItem, BlockTypes } from '../../types';
import { BlockInstance, BlockListener, HistoryManager } from '../index';

import { YjsHistoryManager } from './history';
import { ChildrenListenerHandler, ContentListenerHandler } from './listener';
import { YjsContentOperation } from './operation';

const GET_BLOCK_ITEM = Symbol('GET_BLOCK_ITEM');

// eslint-disable-next-line @typescript-eslint/naming-convention
const getMapFromYArray = (array: YArray<string>) =>
    new Map(array.map((child, index) => [child, index]));

type YjsBlockInstanceProps = {
    id: string;
    block: YMap<unknown>;
    binary?: YArray<ArrayBuffer>;
    setBlock: (
        id: string,
        block: BlockItem<YjsContentOperation>
    ) => Promise<void>;
    getUpdated: (id: string) => number | undefined;
    getCreator: (id: string) => string | undefined;
    getBlockInstance: (id: string) => YjsBlockInstance | undefined;
};

export class YjsBlockInstance implements BlockInstance<YjsContentOperation> {
    private readonly _id: string;
    private readonly _block: YMap<unknown>;
    private readonly _binary?: YArray<ArrayBuffer>;
    private readonly _children: YArray<string>;
    private readonly _setBlock: (
        id: string,
        block: BlockItem<YjsContentOperation>
    ) => Promise<void>;
    private readonly _getUpdated: (id: string) => number | undefined;
    private readonly _getCreator: (id: string) => string | undefined;
    private readonly _getBlockInstance: (
        id: string
    ) => YjsBlockInstance | undefined;
    private readonly _childrenListeners: Map<string, BlockListener>;
    private readonly _contentListeners: Map<string, BlockListener>;

    // eslint-disable-next-line @typescript-eslint/naming-convention
    _childrenMap: Map<string, number>;

    constructor(props: YjsBlockInstanceProps) {
        this._id = props.id;
        this._block = props.block;
        this._binary = props.binary;

        this._children = props.block.get('children') as YArray<string>;
        this._childrenMap = getMapFromYArray(this._children);
        this._setBlock = props.setBlock;
        this._getUpdated = props.getUpdated;
        this._getCreator = props.getCreator;
        this._getBlockInstance = props.getBlockInstance;

        this._childrenListeners = new Map();
        this._contentListeners = new Map();

        const content = this._block.get('content') as YMap<unknown>;

        this._children.observe(event =>
            ChildrenListenerHandler(this._childrenListeners, event)
        );
        content?.observeDeep(events =>
            ContentListenerHandler(this._contentListeners, events)
        );
        // TODO: flavor needs optimization
        this._block.observeDeep(events =>
            ContentListenerHandler(this._contentListeners, events)
        );
    }

    on(
        key: 'children' | 'content',
        name: string,
        listener: BlockListener
    ): void {
        if (key === 'children') {
            this.addChildrenListener(name, listener);
        } else if (key === 'content') {
            this.addContentListener(name, listener);
        }
    }

    off(key: 'children' | 'content', name: string): void {
        if (key === 'children') {
            this.removeChildrenListener(name);
        } else if (key === 'content') {
            this.removeContentListener(name);
        }
    }

    addChildrenListener(name: string, listener: BlockListener): void {
        this._childrenListeners.set(name, listener);
    }

    removeChildrenListener(name: string): void {
        this._childrenListeners.delete(name);
    }

    addContentListener(name: string, listener: BlockListener): void {
        this._contentListeners.set(name, listener);
    }

    removeContentListener(name: string): void {
        this._contentListeners.delete(name);
    }

    get id() {
        return this._id;
    }

    get content(): YjsContentOperation {
        if (this.type === BlockTypes.block) {
            const content = this._block.get('content');
            if (content instanceof YAbstractType) {
                return new YjsContentOperation(content);
            } else {
                throw new Error(`Invalid content type: ${typeof content}`);
            }
        } else if (this.type === BlockTypes.binary && this._binary) {
            return new YjsContentOperation(this._binary);
        }
        throw new Error(
            `Invalid content type: ${this.type}, ${this._block.get(
                'content'
            )}, ${this._binary}`
        );
    }

    get type(): BlockItem<YjsContentOperation>['type'] {
        return this._block.get(
            'type'
        ) as BlockItem<YjsContentOperation>['type'];
    }

    get flavor(): BlockItem<YjsContentOperation>['flavor'] {
        return this._block.get(
            'flavor'
        ) as BlockItem<YjsContentOperation>['flavor'];
    }

    // TODO: bad case. Need to optimize.
    setFlavor(flavor: BlockItem<YjsContentOperation>['flavor']) {
        this._block.set('flavor', flavor);
    }

    get created(): BlockItem<YjsContentOperation>['created'] {
        return this._block.get(
            'created'
        ) as BlockItem<YjsContentOperation>['created'];
    }

    get updated(): number {
        return this._getUpdated(this._id) || this.created;
    }

    get creator(): string | undefined {
        return this._getCreator(this._id);
    }

    get children(): string[] {
        return this._children.toArray();
    }

    getChildren(ids?: (string | undefined)[]): YjsBlockInstance[] {
        const query_ids = ids?.filter((id): id is string => !!id) || [];
        const exists_ids = this._children.map(id => id);
        const filter_ids = query_ids.length ? query_ids : exists_ids;
        return exists_ids
            .filter(id => filter_ids.includes(id))
            .map(id => this._getBlockInstance(id))
            .filter((v): v is YjsBlockInstance => !!v);
    }

    hasChildren(id: string): boolean {
        if (this.children.includes(id)) return true;
        return this.getChildren().some(block => block.hasChildren(id));
    }

    private position_calculator(
        max_pos: number,
        position?: { pos?: number; before?: string; after?: string }
    ) {
        const { pos, before, after } = position || {};
        if (typeof pos === 'number' && Number.isInteger(pos)) {
            if (pos >= 0 && pos < max_pos) {
                return pos;
            }
        } else if (before) {
            const current_pos = this._childrenMap.get(before || '');
            if (
                typeof current_pos === 'number' &&
                Number.isInteger(current_pos)
            ) {
                const prev_pos = current_pos;
                if (prev_pos >= 0 && prev_pos < max_pos) {
                    return prev_pos;
                }
            }
        } else if (after) {
            const current_pos = this._childrenMap.get(after || '');
            if (
                typeof current_pos === 'number' &&
                Number.isInteger(current_pos)
            ) {
                const next_pos = current_pos + 1;
                if (next_pos >= 0 && next_pos < max_pos) {
                    return next_pos;
                }
            }
        }
        return undefined;
    }

    async insertChildren(
        block: YjsBlockInstance,
        pos?: { pos?: number; before?: string; after?: string }
    ): Promise<void> {
        const content = block[GET_BLOCK_ITEM]();
        if (content) {
            const lastIndex = this._childrenMap.get(block.id);
            if (typeof lastIndex === 'number') {
                this._children.delete(lastIndex);
                this._childrenMap = getMapFromYArray(this._children);
            }

            const position = this.position_calculator(
                this._childrenMap.size,
                pos
            );
            if (typeof position === 'number') {
                this._children.insert(position, [block.id]);
            } else {
                this._children.push([block.id]);
            }
            await this._setBlock(block.id, content);
            this._childrenMap = getMapFromYArray(this._children);
        }
    }

    removeChildren(ids: (string | undefined)[]): Promise<string[]> {
        return new Promise(resolve => {
            if (this._children.doc) {
                transact(this._children.doc, () => {
                    const failed = [];
                    for (const id of ids) {
                        let idx = -1;
                        for (const block_id of this._children) {
                            idx += 1;
                            if (block_id === id) {
                                this._children.delete(idx);
                                break;
                            }
                        }
                        if (id) failed.push(id);
                    }

                    this._childrenMap = getMapFromYArray(this._children);
                    resolve(failed);
                });
            } else {
                resolve(ids.filter((id): id is string => !!id));
            }
        });
    }

    public scopedHistory(scope: any[]): HistoryManager {
        return new YjsHistoryManager(this._block, scope);
    }

    [GET_BLOCK_ITEM]() {
        // check null & undefined
        if (this.content != null) {
            return {
                type: this.type,
                flavor: this.flavor,
                children: this._children.slice(),
                created: this.created,
                content: this.content,
            };
        }
        return undefined;
    }
}
