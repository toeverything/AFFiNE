/* eslint-disable max-lines */
import {
    AbstractType as YAbstractType,
    Array as YArray,
    Map as YMap,
    Text as YText,
} from 'yjs';

import {
    ArrayOperation,
    BaseTypes,
    BlockListener,
    ContentOperation,
    ContentTypes,
    MapOperation,
    Operable,
    TextOperation,
    TextToken,
} from '../index';
import { ChildrenListenerHandler, ContentListenerHandler } from './listener';

const INTO_INNER = Symbol('INTO_INNER');

export const DO_NOT_USE_THIS_OR_YOU_WILL_BE_FIRED_SYMBOL_INTO_INNER: typeof INTO_INNER =
    INTO_INNER;

function auto_get(root: ContentOperation, key: string): unknown | undefined {
    const array = root.asArray();
    if (array && !Number.isNaN(Number(key))) return array.get(Number(key));
    const map = root.asMap();
    if (map) return map.get(key);
    const text = root.asText();
    if (text) return text.toString();
    console.error('auto_get unknown root', root, key);
    return undefined;
}

function auto_set(root: ContentOperation, key: string, data: BaseTypes): void {
    const array = root.asArray<BaseTypes>();
    if (array && !Number.isNaN(Number(key))) {
        return array.insert(Number(key), [data]);
    }
    const map = root.asMap<BaseTypes>();
    if (map) {
        return map.set(key, data);
    }
    const text = root.asText();
    if (text && !Number.isNaN(Number(key)) && typeof data === 'string') {
        return text.insert(Number(key), data);
    }
    console.error('autoSet unknown root or path', root, key, data);
}

export class YjsContentOperation implements ContentOperation {
    readonly _content: YAbstractType<unknown>;

    constructor(content: YAbstractType<any>) {
        this._content = content;
    }

    get length(): number {
        if (this._content instanceof YMap) {
            return this._content.size;
        }
        if (this._content instanceof YArray || this._content instanceof YText) {
            return this._content.length;
        }
        return 0;
    }

    createText(): YjsTextOperation {
        return new YjsTextOperation(new YText());
    }

    createArray<
        T extends ContentTypes = ContentOperation
    >(): YjsArrayOperation<T> {
        return new YjsArrayOperation(new YArray());
    }

    createMap<T extends ContentTypes = ContentOperation>(): YjsMapOperation<T> {
        return new YjsMapOperation(new YMap());
    }

    asText(): YjsTextOperation | undefined {
        if (this._content instanceof YText) {
            return new YjsTextOperation(this._content);
        }
        return undefined;
    }

    asArray<T extends ContentTypes = ContentOperation>():
        | YjsArrayOperation<T>
        | undefined {
        if (this._content instanceof YArray) {
            return new YjsArrayOperation(this._content);
        }
        return undefined;
    }

    asMap<T extends ContentTypes = ContentOperation>():
        | YjsMapOperation<T>
        | undefined {
        if (this._content instanceof YMap) {
            return new YjsMapOperation(this._content);
        }
        return undefined;
    }

    autoGet(
        root: ThisType<ContentOperation> | Record<string, unknown>,
        path: string[]
    ): unknown | undefined {
        if (root) {
            if (path.length === 0) {
                return root;
            } else if (root instanceof YjsContentOperation) {
                const [key, ...rest] = path;
                const new_root = auto_get(root, key);
                if (new_root) {
                    return this.autoGet(new_root as typeof root, rest);
                }
            } else if (typeof root === 'object') {
                throw new Error(
                    'autoGet must not get a non-value type, this is a deprecated behavior'
                );
            }
        }
        console.error('autoGet unknown root', root, path);
        return undefined;
    }

    autoSet(
        root: ThisType<ContentOperation>,
        path: string[],
        data: BaseTypes,
        partial?: boolean
    ): void {
        if (root) {
            if (path.length === 0) {
                if (data && typeof data === 'object') {
                    throw new Error(
                        'autoSet must not set a non-value type, this is a deprecated behavior'
                    );
                } else {
                    console.error('autoSet unknown data', root, path, data);
                }
                return;
            }
            if (root instanceof YjsContentOperation) {
                if (path.length === 1) {
                    const [key] = path;
                    if (key) return auto_set(root, key, data);
                    console.error('autoSet unknown path', root, path, data);
                    return;
                }
                const [key, ...rest] = path;
                const new_root = auto_get(root, key);
                if (new_root && new_root instanceof YjsContentOperation) {
                    return this.autoSet(new_root, rest, data, partial);
                } else {
                    throw new Error(
                        'autoSet must not set a non-value type, this is a deprecated behavior'
                    );
                }
            }
        }
        console.error('autoSet unknown root', root, path);
    }

    protected into_inner<T>(content: Operable<T>): T {
        if (content instanceof YjsContentOperation) {
            return content[INTO_INNER]() as unknown as T;
        } else {
            return content as T;
        }
    }

    protected to_operable<T>(content: T): Operable<T> {
        if (content instanceof YAbstractType) {
            return new YjsContentOperation(content) as unknown as Operable<T>;
        }
        return content as Operable<T>;
    }

    [INTO_INNER](): YAbstractType<unknown> | undefined {
        if (this._content instanceof YAbstractType) {
            return this._content;
        }
        return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    private toJSON() {
        return this._content.toJSON();
    }
}

class YjsTextOperation extends YjsContentOperation implements TextOperation {
    readonly _textContent: YText;

    constructor(content: YText) {
        super(content);
        this._textContent = content;
    }

    insert(
        index: number,
        content: string,
        format?: Record<string, string>
    ): void {
        this._textContent.insert(index, content, format);
    }

    format(
        index: number,
        length: number,
        format: Record<string, string>
    ): void {
        this._textContent.format(index, length, format);
    }

    delete(index: number, length: number): void {
        this._textContent.delete(index, length);
    }

    setAttribute(name: string, value: BaseTypes) {
        this._textContent.setAttribute(name, value);
    }

    getAttribute<T extends BaseTypes = string>(name: string): T | undefined {
        return this._textContent.getAttribute(name);
    }

    override toString(): TextToken[] {
        return this._textContent.toDelta();
    }
}

class YjsArrayOperation<T extends ContentTypes>
    extends YjsContentOperation
    implements ArrayOperation<T>
{
    readonly _arrayContent: YArray<T>;
    readonly _listeners: Map<string, BlockListener>;

    constructor(content: YArray<T>) {
        super(content);
        this._arrayContent = content;
        this._listeners = new Map();

        this._arrayContent.observe(event =>
            ChildrenListenerHandler(this._listeners, event)
        );
    }

    on(name: string, listener: BlockListener) {
        this._listeners.set(name, listener);
    }

    off(name: string) {
        this._listeners.delete(name);
    }

    insert(index: number, content: Array<Operable<T>>): void {
        this._arrayContent.insert(
            index,
            content.map(v => this.into_inner(v))
        );
    }

    delete(index: number, length: number): void {
        this._arrayContent.delete(index, length);
    }

    push(content: Array<Operable<T>>): void {
        this._arrayContent.push(content.map(v => this.into_inner(v)));
    }

    unshift(content: Array<Operable<T>>): void {
        this._arrayContent.unshift(content.map(v => this.into_inner(v)));
    }

    get(index: number): Operable<T> | undefined {
        const content = this._arrayContent.get(index);
        if (content) return this.to_operable(content);
        return undefined;
    }

    private get_internal(index: number): T {
        return this._arrayContent.get(index);
    }

    slice(start?: number, end?: number): Operable<T>[] {
        return this._arrayContent
            .slice(start, end)
            .map(v => this.to_operable(v));
    }

    map<R = unknown>(callback: (value: T, index: number) => R): R[] {
        return this._arrayContent.map((value, index) => callback(value, index));
    }

    // Traverse, if callback returns false, stop traversing
    forEach(callback: (value: T, index: number) => boolean) {
        for (let i = 0; i < this._arrayContent.length; i++) {
            const ret = callback(this.get_internal(i), i);
            if (ret === false) {
                break;
            }
        }
    }

    find<R = unknown>(
        callback: (value: T, index: number) => boolean
    ): R | undefined {
        let result: R | undefined = undefined;
        this.forEach((value, i) => {
            const found = callback(value, i);
            if (found) {
                result = value as unknown as R;
                return false;
            }
            return true;
        });
        return result;
    }

    findIndex(callback: (value: T, index: number) => boolean): number {
        let position = -1;
        this.forEach((value, i) => {
            const found = callback(value, i);
            if (found) {
                position = i;
                return false;
            }
            return true;
        });
        return position;
    }
}

class YjsMapOperation<T extends ContentTypes>
    extends YjsContentOperation
    implements MapOperation<T>
{
    readonly _mapContent: YMap<T>;
    readonly _listeners: Map<string, BlockListener>;

    constructor(content: YMap<T>) {
        super(content);
        this._mapContent = content;
        this._listeners = new Map();

        content?.observeDeep(events =>
            ContentListenerHandler(this._listeners, events)
        );
    }

    on(name: string, listener: BlockListener) {
        this._listeners.set(name, listener);
    }

    off(name: string) {
        this._listeners.delete(name);
    }

    set(key: string, value: Operable<T>): void {
        if (value instanceof YjsContentOperation) {
            const content = value[INTO_INNER]();
            if (content) this._mapContent.set(key, content as unknown as T);
        } else {
            this._mapContent.set(key, value as T);
        }
    }

    get(key: string): Operable<T> | undefined {
        const content = this._mapContent.get(key);
        if (content) return this.to_operable(content);
        return undefined;
    }

    delete(key: string): void {
        this._mapContent.delete(key);
    }

    has(key: string): boolean {
        return this._mapContent.has(key);
    }
}
