import { ContentOperation } from '../adapter';
import { RefMetadata } from './metadata';
import { UUID } from './uuid';
// base type of block
// y_block: tree structure expression with YAbstractType as root
// y_binary: arbitrary binary data
export const BlockTypes = {
    block: 'y_block' as const, // data block
    binary: 'y_binary' as const, // binary data
};

// block flavor
// block has the same basic structure
// But different flavors provide different parsing of their content
// TODO, how do blockdb BlockFlavors synchronize with the protocol of '@toeverything/components/editor-blocks'?
export const BlockFlavors = {
    workspace: 'workspace' as const, // workspace
    page: 'page' as const, // page
    group: 'group' as const, // group
    title: 'title' as const, // title
    text: 'text' as const, // text
    heading1: 'heading1' as const, // heading 1
    heading2: 'heading2' as const, // heading 2
    heading3: 'heading3' as const, // heading 3
    code: 'code' as const, // code block
    todo: 'todo' as const, // todo
    numbered: 'numbered' as const, // numbered list
    bullet: 'bullet' as const, // bullet list
    comments: 'comments' as const, // comments
    tag: 'tag' as const, // tag
    reference: 'reference' as const, // reference
    image: 'image' as const, // image
    file: 'file' as const, //file
    audio: 'audio' as const, // audio
    video: 'video' as const, // video
    shape: 'shape' as const, // artboard shape
    quote: 'quote' as const, // quote
    toc: 'toc' as const, //directory
    database: 'database' as const, //Multidimensional table
    whiteboard: 'whiteboard' as const, // whiteboard
    template: 'template' as const, // template
    discussion: 'discussion' as const, // comment header
    comment: 'comment' as const, // comment details
    activity: 'activity' as const, // dynamic message
    divider: 'divider' as const, // divider line
    groupDivider: 'groupDivider' as const, // group divider
    youtube: 'youtube' as const, // Youtube
    figma: 'figma' as const, // figma
    embedLink: 'embedLink' as const, //embed link
    toggle: 'toggle' as const, // collapse the list
    callout: 'callout' as const, // reminder
    grid: 'grid' as const, // grid layout
    gridItem: 'gridItem' as const, // grid layout children
};

export type BlockTypeKeys = keyof typeof BlockTypes;
export type BlockFlavorKeys = keyof typeof BlockFlavors;

export type BlockItem<C extends ContentOperation> = {
    readonly type: typeof BlockTypes[BlockTypeKeys];
    flavor: typeof BlockFlavors[BlockFlavorKeys];
    children: string[];
    readonly created: number; // creation time, UTC timestamp
    readonly updated?: number; // update time, UTC timestamp
    readonly creator?: string; // creator id
    content: C; // Essentially what is stored here is either Uint8Array (binary resource) or YDoc (structured resource)
};

export type BlockPage = {
    title?: string;
    description?: string;
    // preview
    preview?: UUID<'00000000-0000-0000-0000-000000000000'>;
    // Whether it is a draft, the draft will not be indexed
    draft?: string;
    // Expiration time, documents that exceed this time will be deleted
    ttl?: number;
    // Metadata, currently only bibtex definitions
    // When metadata exists, it will be treated as a reference and can be searched by tag reference
    metadata?: RefMetadata;
};
