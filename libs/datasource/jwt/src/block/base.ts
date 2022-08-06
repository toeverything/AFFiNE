import {
    ArrayOperation,
    BlockInstance,
    ContentOperation,
    ContentTypes,
    InternalPlainObject,
    MapOperation,
} from '../adapter';
import { BlockItem } from '../types';
import { getLogger } from '../utils';

import { AbstractBlock } from './abstract';
import { BlockCapability } from './capability';

const logger = getLogger('BlockDB:block');

// TODO
export interface Decoration extends InternalPlainObject {
    key: string;
    value: unknown;
}

type Validator = <T>(value: T | undefined) => boolean | void;

export type IndexMetadata = Readonly<{
    content?: string;
    reference?: string;
    tags: string[];
}>;
export type QueryMetadata = Readonly<
    {
        [key: string]: number | string | string[] | undefined;
    } & Omit<BlockItem<any>, 'content'>
>;

export type ReadableContentExporter<
    R = string,
    T extends ContentTypes = ContentOperation
> = (content: MapOperation<T>) => R;
type GetExporter<R> = (
    block: BlockInstance<any>
) => Readonly<[string, ReadableContentExporter<R, any>]>[];

type Exporters = {
    content: GetExporter<string>;
    metadata: GetExporter<Array<[string, number | string | string[]]>>;
    tag: GetExporter<string[]>;
};

export class BaseBlock<
    B extends BlockInstance<C>,
    C extends ContentOperation
> extends AbstractBlock<B, C> {
    private readonly _exporters?: Exporters;
    private readonly _contentExportersGetter: () => Map<
        string,
        ReadableContentExporter<string, any>
    >;
    private readonly _metadataExportersGetter: () => Map<
        string,
        ReadableContentExporter<
            Array<[string, number | string | string[]]>,
            any
        >
    >;
    private readonly _tagExportersGetter: () => Map<
        string,
        ReadableContentExporter<string[], any>
    >;

    validators: Map<string, Validator> = new Map();

    constructor(
        block: B,
        root?: AbstractBlock<B, C>,
        parent?: AbstractBlock<B, C>,
        exporters?: Exporters
    ) {
        super(block, root, parent);

        this._exporters = exporters;
        this._contentExportersGetter = () => new Map(exporters?.content(block));
        this._metadataExportersGetter = () =>
            new Map(exporters?.metadata(block));
        this._tagExportersGetter = () => new Map(exporters?.tag(block));
    }

    get parent() {
        return this.parent_node as BaseBlock<B, C> | undefined;
    }

    private get decoration(): ArrayOperation<Decoration> | undefined {
        const content = this.getContent<ArrayOperation<Decoration>>();
        if (!content.has('decoration')) {
            const decoration = content.createArray<Decoration>();
            content.set('decoration', decoration);
        }
        return content.get('decoration')?.asArray();
    }

    getDecoration<T = unknown>(key: string): T | undefined {
        const decoration = this.decoration?.find<Decoration>(
            decoration => decoration.key === key
        );
        if (this.validate(key, decoration?.value)) {
            return decoration?.value as T;
        }
        return undefined;
    }

    getDecorations<T = Record<string, unknown>>(): T {
        const decorations = {} as T;
        this.decoration?.forEach(decoration => {
            const value = this.validate(decoration.key, decoration.value)
                ? decoration.value
                : undefined;
            // @ts-ignore
            decorations[decoration.key] = value;
        });
        return decorations;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getCapability<T extends BlockCapability>(key: string): T | undefined {
        // TODO: Capability api design
        return undefined;
    }

    setDecoration(key: string, value: unknown) {
        if (!this.validate(key, value)) {
            throw new Error(`set [${key}] error: validate error.`);
        }
        const decoration = { key, value };
        const index =
            this.decoration?.findIndex(decoration => decoration.key === key) ??
            -1;
        if (index > -1) {
            this.decoration?.delete(index, 1);
            this.decoration?.insert(index, [decoration]);
        } else {
            this.decoration?.insert(this.decoration?.length, [decoration]);
        }
    }

    removeDecoration(key: string) {
        const index =
            this.decoration?.findIndex(decoration => decoration.key === key) ??
            -1;
        if (index > -1) {
            this.decoration?.delete(index, 1);
        }
    }

    clearDecoration() {
        this.decoration?.delete(0, this.decoration?.length);
    }

    setValidator(key: string, validator?: Validator) {
        if (validator) {
            this.validators.set(key, validator);
        } else {
            this.validators.delete(key);
        }
    }

    private validate(key: string, value: unknown): boolean {
        const validate = this.validators.get(key);
        if (validate) {
            return validate(value) === false ? false : true;
        }
        return true;
    }

    get group(): BaseBlock<B, C> | undefined {
        if (this.flavor === 'group') {
            return this;
        }
        return this.parent?.group;
    }

    /**
     * Get an instance of the child Block
     * @param blockId block id
     */
    private get_children_instance(blockId?: string): BaseBlock<B, C>[] {
        return this.get_children(blockId).map(
            block => new BaseBlock(block, this.root, this, this._exporters)
        );
    }

    private get_indexable_metadata() {
        const metadata: Record<string, number | string | string[]> = {};
        for (const [name, exporter] of this._metadataExportersGetter()) {
            try {
                for (const [key, val] of exporter(this.getContent())) {
                    metadata[key] = val;
                }
            } catch (err) {
                logger(`Failed to export metadata: ${name}`, err);
            }
        }
        try {
            const parent_page = this._getParentPage(false);
            if (parent_page) metadata['page'] = parent_page;
            if (this.group) metadata['group'] = this.group.id;
            if (this.parent) metadata['parent'] = this.parent.id;
        } catch (e) {
            logger(`Failed to export default metadata`, e);
        }

        return metadata;
    }

    public getQueryMetadata(): QueryMetadata {
        return {
            type: this.type,
            flavor: this.flavor,
            creator: this.creator,
            children: this.children,
            created: this.created,
            updated: this.lastUpdated,
            ...this.get_indexable_metadata(),
        };
    }

    private get_indexable_content(): string | undefined {
        const contents = [];
        for (const [name, exporter] of this._contentExportersGetter()) {
            try {
                const content = exporter(this.getContent());
                if (content) contents.push(content);
            } catch (err) {
                logger(`Failed to export content: ${name}`, err);
            }
        }
        if (!contents.length) {
            try {
                const content = this.getContent() as any;
                return JSON.stringify(content['toJSON']());
                // eslint-disable-next-line no-empty
            } catch (e) {}
        }
        return contents.join('\n');
    }

    private get_indexable_tags(): string[] {
        const tags: string[] = [];
        for (const [name, exporter] of this._tagExportersGetter()) {
            try {
                tags.push(...exporter(this.getContent()));
            } catch (err) {
                logger(`Failed to export tags: ${name}`, err);
            }
        }

        return tags;
    }

    public getIndexMetadata(): IndexMetadata {
        return {
            content: this.get_indexable_content(),
            reference: '', // TODO: bibliography
            tags: [...this.getTags(), ...this.get_indexable_tags()],
        };
    }

    // ======================================
    // DOM like apis
    // ======================================

    get firstChild() {
        return this.get_children_instance(this.children[0]);
    }

    get lastChild() {
        const children = this.children;
        return this.get_children_instance(children[children.length - 1]);
    }

    get nextSibling(): BaseBlock<B, C> | undefined {
        if (this.parent) {
            const parent = this.parent;
            const children = parent.children;
            const index = children.indexOf(this.id);
            return parent.get_children_instance(children[index + 1])[0];
        }
        return undefined;
    }

    get nextSiblings(): BaseBlock<B, C>[] {
        if (this.parent) {
            const parent = this.parent;
            const children = parent.children;
            const index = children.indexOf(this.id);
            return (
                children
                    .slice(index + 1)
                    .flatMap(id => parent.get_children_instance(id)) || []
            );
        }
        return [];
    }

    get previousSibling(): BaseBlock<B, C> | undefined {
        if (this.parent) {
            const parent = this.parent;
            const children = parent.children;
            const index = children.indexOf(this.id);
            return parent.get_children_instance(children[index - 1])[0];
        }
        return undefined;
    }

    contains(block: AbstractBlock<B, C>) {
        if (this === block) {
            return true;
        }
        return this.hasChildren(block.id);
    }
}
