import {
    AbstractType as YAbstractType,
    Array as YArray,
    Map as YMap,
    transact,
} from 'yjs';

import { BlockInstance, BlockListener, HistoryManager } from '../index';
import { BlockItem, BlockTypes } from '../../types';

import { YjsContentOperation } from './operation';
import { ChildrenListenerHandler, ContentListenerHandler } from './listener';
import { YjsHistoryManager } from './history';

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
    readonly #id: string;
    readonly #block: YMap<unknown>;
    readonly #binary?: YArray<ArrayBuffer>;
    readonly #children: YArray<string>;
    readonly #set_block: (
        id: string,
        block: BlockItem<YjsContentOperation>
    ) => Promise<void>;
    readonly #get_updated: (id: string) => number | undefined;
    readonly #get_creator: (id: string) => string | undefined;
    readonly #get_block_instance: (id: string) => YjsBlockInstance | undefined;
    readonly #children_listeners: Map<string, BlockListener>;
    readonly #content_listeners: Map<string, BlockListener>;

    // eslint-disable-next-line @typescript-eslint/naming-convention
    #children_map: Map<string, number>;

    constructor(props: YjsBlockInstanceProps) {
        this.#id = props.id;
        this.#block = props.block;
        this.#binary = props.binary;

        this.#children = props.block.get('children') as YArray<string>;
        this.#children_map = getMapFromYArray(this.#children);
        this.#set_block = props.setBlock;
        this.#get_updated = props.getUpdated;
        this.#get_creator = props.getCreator;
        this.#get_block_instance = props.getBlockInstance;

        this.#children_listeners = new Map();
        this.#content_listeners = new Map();

        const content = this.#block.get('content') as YMap<unknown>;

        this.#children.observe(event =>
            ChildrenListenerHandler(this.#children_listeners, event)
        );
        content?.observeDeep(events =>
            ContentListenerHandler(this.#content_listeners, events)
        );
        // TODO: flavor needs optimization
        this.#block.observeDeep(events =>
            ContentListenerHandler(this.#content_listeners, events)
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
        this.#children_listeners.set(name, listener);
    }

    removeChildrenListener(name: string): void {
        this.#children_listeners.delete(name);
    }

    addContentListener(name: string, listener: BlockListener): void {
        this.#content_listeners.set(name, listener);
    }

    removeContentListener(name: string): void {
        this.#content_listeners.delete(name);
    }

    get id() {
        return this.#id;
    }

    get content(): YjsContentOperation {
        if (this.type === BlockTypes.block) {
            const content = this.#block.get('content');
            if (content instanceof YAbstractType) {
                return new YjsContentOperation(content);
            } else {
                throw new Error(`Invalid content type: ${typeof content}`);
            }
        } else if (this.type === BlockTypes.binary && this.#binary) {
            return new YjsContentOperation(this.#binary);
        }
        throw new Error(
            `Invalid content type: ${this.type}, ${this.#block.get(
                'content'
            )}, ${this.#binary}`
        );
    }

    get type(): BlockItem<YjsContentOperation>['type'] {
        return this.#block.get(
            'type'
        ) as BlockItem<YjsContentOperation>['type'];
    }

    get flavor(): BlockItem<YjsContentOperation>['flavor'] {
        return this.#block.get(
            'flavor'
        ) as BlockItem<YjsContentOperation>['flavor'];
    }

    // TODO: bad case. Need to optimize.
    setFlavor(flavor: BlockItem<YjsContentOperation>['flavor']) {
        this.#block.set('flavor', flavor);
    }

    get created(): BlockItem<YjsContentOperation>['created'] {
        return this.#block.get(
            'created'
        ) as BlockItem<YjsContentOperation>['created'];
    }

    get updated(): number {
        return this.#get_updated(this.#id) || this.created;
    }

    get creator(): string | undefined {
        return this.#get_creator(this.#id);
    }

    get children(): string[] {
        return this.#children.toArray();
    }

    getChildren(ids?: (string | undefined)[]): YjsBlockInstance[] {
        const query_ids = ids?.filter((id): id is string => !!id) || [];
        const exists_ids = this.#children.map(id => id);
        const filter_ids = query_ids.length ? query_ids : exists_ids;
        return exists_ids
            .filter(id => filter_ids.includes(id))
            .map(id => this.#get_block_instance(id))
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
            const current_pos = this.#children_map.get(before || '');
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
            const current_pos = this.#children_map.get(after || '');
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
            const lastIndex = this.#children_map.get(block.id);
            if (typeof lastIndex === 'number') {
                this.#children.delete(lastIndex);
                this.#children_map = getMapFromYArray(this.#children);
            }

            const position = this.position_calculator(
                this.#children_map.size,
                pos
            );
            if (typeof position === 'number') {
                this.#children.insert(position, [block.id]);
            } else {
                this.#children.push([block.id]);
            }
            await this.#set_block(block.id, content);
            this.#children_map = getMapFromYArray(this.#children);
        }
    }

    removeChildren(ids: (string | undefined)[]): Promise<string[]> {
        return new Promise(resolve => {
            if (this.#children.doc) {
                transact(this.#children.doc, () => {
                    const failed = [];
                    for (const id of ids) {
                        let idx = -1;
                        for (const block_id of this.#children) {
                            idx += 1;
                            if (block_id === id) {
                                this.#children.delete(idx);
                                break;
                            }
                        }
                        if (id) failed.push(id);
                    }

                    this.#children_map = getMapFromYArray(this.#children);
                    resolve(failed);
                });
            } else {
                resolve(ids.filter((id): id is string => !!id));
            }
        });
    }

    public scopedHistory(scope: any[]): HistoryManager {
        return new YjsHistoryManager(this.#block, scope);
    }

    [GET_BLOCK_ITEM]() {
        // check null & undefined
        if (this.content != null) {
            return {
                type: this.type,
                flavor: this.flavor,
                children: this.#children.slice(),
                created: this.created,
                content: this.content,
            };
        }
        return undefined;
    }
}
