import { AbstractType as YAbstractType } from 'yjs';

import { BlockItem } from '../types';

export type ChangedStateKeys = 'add' | 'update' | 'delete';
export type ChangedStates<S = ChangedStateKeys> = Map<string, S>;

export type BlockListener<S = ChangedStateKeys, R = unknown> = (
    states: ChangedStates<S>
) => Promise<R> | R;

export type Connectivity = 'disconnect' | 'connecting' | 'connected' | 'retry';

export type Operable<T, Base = YAbstractType<any>> = T extends Base
    ? ContentOperation
    : T;

export interface InternalPlainObject {}

export type BaseTypes = string | number | boolean | InternalPlainObject;

export type ContentTypes = BaseTypes | ContentOperation;

interface ContentOperation {
    get length(): number;
    createText(): TextOperation;
    createArray<T extends ContentTypes = ContentOperation>(): ArrayOperation<T>;
    createMap<T extends ContentTypes = ContentOperation>(): MapOperation<T>;
    asText(): TextOperation | undefined;
    asArray<T extends ContentTypes = ContentOperation>():
        | ArrayOperation<T>
        | undefined;
    asMap<T extends ContentTypes = ContentOperation>():
        | MapOperation<T>
        | undefined;
    autoGet(
        root: ThisType<ContentOperation> | Record<string, unknown>,
        path: string[]
    ): unknown | undefined;
    autoSet(
        root: ThisType<ContentOperation>,
        path: string[],
        data: unknown,
        partial?: boolean
    ): void;
}

type TextAttributes = Record<string, string>;

export type TextToken = {
    insert: string;
    attributes?: TextAttributes;
};

export interface TextOperation extends ContentOperation {
    insert(
        index: number,
        content: string,
        format?: Record<string, string>
    ): void;
    format(index: number, length: number, format: Record<string, string>): void;
    delete(index: number, length: number): void;
    setAttribute(name: string, value: BaseTypes): void;
    getAttribute<T extends BaseTypes = string>(name: string): T | undefined;
    toString(): TextToken[];
}

export interface ArrayOperation<T extends ContentTypes = ContentOperation>
    extends ContentOperation {
    insert(index: number, content: Array<Operable<T>>): void;
    delete(index: number, length: number): void;
    push(content: Array<Operable<T>>): void;
    unshift(content: Array<Operable<T>>): void;
    get(index: number): Operable<T> | undefined;
    slice(start?: number, end?: number): Array<Operable<T>>;
    map<R = unknown>(callback: (value: T, index: number) => R): Array<R>;
    forEach(callback: (value: T, index: number) => boolean | void): void;
    find<R = unknown>(
        callback: (value: T, index: number) => boolean
    ): R | undefined;
    findIndex(callback: (value: T, index: number) => boolean): number;
}

export interface MapOperation<T extends ContentTypes = ContentOperation>
    extends ContentOperation {
    set(key: string, value: Operable<T>): void;
    get(key: string): Operable<T> | undefined;
    delete(key: string): void;
    has(key: string): boolean;
}

export type HistoryCallback<T = unknown> = (map: Map<string, T>) => void;

export interface HistoryManager {
    onPush<T = unknown>(name: string, callback: HistoryCallback<T>): void;
    offPush(name: string): boolean;
    onPop<T = unknown>(name: string, callback: HistoryCallback<T>): void;
    offPop(name: string): boolean;
    undo<T = unknown>(): Map<string, T> | undefined;
    redo<T = unknown>(): Map<string, T> | undefined;
    clear(): void;
}

type BlockPosition = { pos?: number; before?: string; after?: string };

interface BlockInstance<C extends ContentOperation> {
    get id(): string;
    get type(): BlockItem<C>['type'];
    get flavor(): BlockItem<C>['flavor'];
    // TODO: flavor needs optimization
    setFlavor(flavor: BlockItem<C>['flavor']): void;
    get created(): BlockItem<C>['created'];
    get updated(): number; // update time, UTC timestamp, read only
    get creator(): string | undefined; // creator id
    get children(): string[];
    getChildren(block_ids: (string | undefined)[]): BlockInstance<C>[];
    hasChildren(block_id: string): boolean;
    insertChildren(
        block: ThisType<BlockInstance<C>>,
        pos?: BlockPosition
    ): void;
    removeChildren(block_ids: (string | undefined)[]): void;
    get content(): BlockItem<C>['content'];
    on(
        key: 'children' | 'content',
        name: string,
        listener: BlockListener
    ): void;
    off(key: 'children' | 'content', name: string): void;
    addChildrenListener(name: string, listener: BlockListener): void;
    removeChildrenListener(name: string): void;
    addContentListener(name: string, listener: BlockListener): void;
    removeContentListener(name: string): void;
    scopedHistory(scope: any[]): HistoryManager;
}

interface AsyncDatabaseAdapter<C extends ContentOperation> {
    inspector(): Record<string, any>;
    reload(): void;
    createBlock(
        options: Pick<BlockItem<C>, 'type' | 'flavor'> & {
            binary?: ArrayBuffer;
            uuid?: string;
        }
    ): Promise<BlockInstance<C>>;
    getBlock(id: string): Promise<BlockInstance<C> | undefined>;
    getBlockByFlavor(flavor: BlockItem<C>['flavor']): Promise<string[]>;
    getBlockByType(type: BlockItem<C>['type']): Promise<string[]>;
    checkBlocks(keys: string[]): Promise<boolean>;
    deleteBlocks(keys: string[]): Promise<string[]>;
    on<S, R>(
        key: 'editing' | 'updated' | 'connectivity',
        listener: BlockListener<S, R>
    ): void;
    suspend(suspend: boolean): void;
    history(): HistoryManager;
    getUserId(): string;
}

export type DataExporter = (binary: Uint8Array) => Promise<void>;

export const getDataExporter = () => {
    let exporter: DataExporter | undefined = undefined;
    let importer: (() => Uint8Array | undefined) | undefined = undefined;

    const importData = () => importer?.();
    const exportData = (binary: Uint8Array) => exporter?.(binary);
    const hasExporter = () => !!exporter;

    const installExporter = (
        initialData: Uint8Array | undefined,
        cb: DataExporter
    ) => {
        return new Promise<void>(resolve => {
            importer = () => initialData;
            exporter = async (data: Uint8Array) => {
                exporter = cb;
                await cb(data);
                resolve();
            };
        });
    };

    return { importData, exportData, hasExporter, installExporter };
};

export { YjsAdapter } from './yjs';
export type { YjsContentOperation, YjsInitOptions } from './yjs';
export type {
    AsyncDatabaseAdapter,
    BlockPosition,
    BlockInstance,
    ContentOperation,
};
