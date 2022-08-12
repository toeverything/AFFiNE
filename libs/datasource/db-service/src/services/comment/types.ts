import { BlockFlavorKeys, ContentColumnValue } from '../index';
export interface CommentReply {
    id: string;
    workspace: string;
    type: BlockFlavorKeys;
    parentId?: string;
    children: string[];
    content: ContentColumnValue;
    created: number;
    lastUpdated: number;
    creator?: string;
}

export interface Comment {
    id: string;
    workspace: string;
    type: BlockFlavorKeys;
    parentId?: string;
    /** store the block-ids where comment is on,
     * useful when comment is not page level but on a specific block in page  */
    attachedToBlocksIds?: string[];
    children: string[];
    quote: ContentColumnValue;
    resolve: boolean;
    resolveUserId?: string;
    created: number;
    lastUpdated: number;
    creator?: string;
}

export interface CreateCommentBlock {
    workspace: string;
    pageId: string;
    attachedToBlocksIds?: string[];
    quote: ContentColumnValue;
    content: ContentColumnValue;
}

export interface CreateReplyBlock {
    workspace: string;
    parentId: string;
    content: ContentColumnValue;
}

export interface UpdateCommentBlock {
    workspace: string;
    id: string;
    pageId?: string;
    attachedToBlocksIds?: string[];
    quote?: ContentColumnValue;
    resolve?: boolean;
}

export interface UpdateReplyBlock {
    workspace: string;
    id: string;
    content: ContentColumnValue;
    parentId?: string;
}

export interface GetCommentsBlock {
    workspace: string;
    pageId: string;
}
