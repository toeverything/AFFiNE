import { DependencyCallOrConstructProps } from '@toeverything/utils';
import type { ReturnUnobserve } from '../database/observer';
import {
    DeleteEditorBlock,
    GetEditorBlock,
    ReturnEditorBlock,
} from '../editor-block/types';
import { EditorBlock, ObserveCallback } from '../editor-block';
import {
    CommentReply,
    CreateCommentBlock,
    CreateReplyBlock,
    UpdateCommentBlock,
    UpdateReplyBlock,
    GetCommentsBlock,
    Comment,
} from './types';
import { DefaultColumnsValue } from './../index';
import { CommentColumnValue } from '../editor-block/utils/column/types';
import { WORKSPACE_COMMENTS } from '../../utils';

export class CommentService {
    protected editor_block: EditorBlock;
    protected get_dependency: DependencyCallOrConstructProps['getDependency'];
    constructor(props: DependencyCallOrConstructProps) {
        this.get_dependency = props.getDependency;
        this.editor_block = this.get_dependency(EditorBlock);
    }

    async createComment({
        workspace,
        pageId,
        attachedToBlocksIds,
        quote,
        content,
    }: CreateCommentBlock): Promise<{ commentsId: string } | undefined> {
        const rootCommentId = await this.get_root_comment_id({
            workspace,
            pageId,
        });
        const discussionBlock = await this.editor_block.create({
            workspace: workspace,
            type: 'comments',
        });

        if (!discussionBlock) {
            return undefined;
        }

        const parentBlock = await this.editor_block.get({
            workspace,
            ids: [rootCommentId],
        });

        if (parentBlock.length === 0) {
            return undefined;
        }

        const children = parentBlock[0]?.children || [];
        children.push(discussionBlock.id);
        const success = await this.editor_block.update({
            id: rootCommentId,
            workspace: workspace,
            children: children,
        });
        if (!success) {
            return undefined;
        }

        let result = false;
        result = await this.updateComment({
            workspace: workspace,
            id: discussionBlock.id,
            attachedToBlocksIds: attachedToBlocksIds || [],
            quote: quote,
            pageId: pageId,
        });
        if (!result) {
            return undefined;
        }

        const reply = await this.createReply({
            workspace: workspace,
            parentId: discussionBlock.id,
            content: content,
        });

        return { commentsId: discussionBlock.id };
    }

    async createReply({
        workspace,
        parentId,
        content,
    }: CreateReplyBlock): Promise<boolean> {
        const reply_block = await this.editor_block.create({
            workspace: workspace,
            type: 'comment',
        });
        if (!reply_block) {
            return false;
        }

        const parent_block = await this.editor_block.get({
            workspace,
            ids: [parentId],
        });

        if (parent_block.length === 0) {
            return false;
        }

        const children = parent_block[0]?.children || [];
        children.push(reply_block.id);
        const success = await this.editor_block.update({
            id: parentId,
            workspace: workspace,
            children: children,
        });
        if (!success) {
            return false;
        }

        return await this.updateReply({
            workspace,
            id: reply_block.id,
            content,
        });
    }

    async updateComment({
        workspace,
        id,
        pageId,
        attachedToBlocksIds,
        quote,
        resolve,
    }: UpdateCommentBlock): Promise<boolean> {
        const properties: Partial<DefaultColumnsValue> = {};
        if (quote !== undefined) {
            properties.text = quote;
        }
        const blocks = await this.editor_block.get({
            workspace,
            ids: [id],
        });
        if (blocks.length === 0) {
            return false;
        }
        const commentValue: CommentColumnValue = {} as CommentColumnValue;
        Object.assign(commentValue, blocks[0]?.properties?.comment);
        if (pageId !== undefined) {
            commentValue.pageId = pageId;
        }
        if (attachedToBlocksIds !== undefined) {
            commentValue.attachedToBlocksIds = attachedToBlocksIds;
        }
        if (resolve !== undefined) {
            commentValue.resolve = resolve;
            commentValue.finishTime = resolve ? Date.now() : undefined;
            commentValue.resolveUserId = resolve
                ? await this.editor_block.getUserId(workspace)
                : undefined;
        }
        properties.comment = commentValue;
        return await this.editor_block.update({
            id: id,
            workspace: workspace,
            properties: properties,
        });
    }

    async updateReply({
        workspace,
        id,
        content,
    }: UpdateReplyBlock): Promise<boolean> {
        return await this.editor_block.update({
            id: id,
            workspace: workspace,
            properties: {
                text: content,
            },
        });
    }

    async delete({ workspace, id }: DeleteEditorBlock): Promise<boolean> {
        return await this.editor_block.delete({
            workspace: workspace,
            id: id,
        });
    }

    async getPageComments({
        workspace,
        pageId,
    }: GetCommentsBlock): Promise<Comment | null> {
        const root_comment_id = await this.get_root_comment_id({
            workspace,
            pageId,
        });
        const comments = await this.getComments({
            workspace,
            ids: [root_comment_id],
        });
        return comments.length > 0 ? comments[0] : null;
    }

    async getComments({
        workspace,
        ids,
    }: GetEditorBlock): Promise<Array<Comment>> {
        const blocks = (await this.get({ workspace, ids })).filter(block => {
            return (
                block &&
                block?.type === 'comments' &&
                !block.properties?.comment?.resolve
            );
        }) as ReturnEditorBlock[];
        const comments = blocks.map(block => {
            return {
                id: block.id,
                workspace: block.workspace,
                type: block.type,
                parentId: block.parentId,
                attachedToBlocksIds:
                    block.properties?.comment?.attachedToBlocksIds || [],
                children: block.children,
                quote: block.properties?.text || [],
                resolve: block.properties?.comment?.resolve || false,
                resolveUserId: block.properties?.comment?.resolveUserId || '',
                created: block.created,
                lastUpdated: block.lastUpdated,
                creator: block.creator,
            } as Comment;
        });
        return comments;
    }

    async getReplyList({
        workspace,
        ids,
    }: GetEditorBlock): Promise<Array<CommentReply>> {
        const blocks = (await this.editor_block.get({ workspace, ids })).filter(
            block => block?.type === 'comment'
        ) as ReturnEditorBlock[];

        const replyList = blocks.map(block => {
            return {
                id: block.id,
                workspace: block.workspace,
                type: block.type,
                parentId: block.parentId,
                children: block.children,
                content: block.properties?.text || [],
                created: block.created,
                lastUpdated: block.lastUpdated,
                creator: block.creator,
            } as CommentReply;
        });
        return replyList;
    }

    async get({
        workspace,
        ids,
    }: GetEditorBlock): Promise<Array<ReturnEditorBlock | null>> {
        const blocks = await this.editor_block.get({
            workspace,
            ids,
        });
        return blocks;
    }

    async observe(
        { workspace, id }: DeleteEditorBlock,
        callback: ObserveCallback
    ): Promise<ReturnUnobserve> {
        return await this.editor_block.observe({ workspace, id }, callback);
    }

    async unobserve({ workspace, id }: DeleteEditorBlock) {
        await this.editor_block.unobserve({ workspace, id });
    }

    private async get_root_comment_id({
        workspace,
        pageId,
    }: GetCommentsBlock): Promise<string> {
        const workspace_db_block = await this.editor_block.getWorkspaceDbBlock(
            workspace
        );
        const workspace_comments: any[] =
            workspace_db_block.getDecoration(WORKSPACE_COMMENTS) || [];
        let root_comment = workspace_comments.find(
            item => item.pageId === pageId
        );
        if (!root_comment) {
            const discussion_block = await this.editor_block.create({
                workspace: workspace,
                type: 'comments',
            });
            root_comment = {
                pageId: pageId,
                rootCommentId: discussion_block.id,
            };
            workspace_comments.push(root_comment);
            workspace_db_block.setDecoration(
                WORKSPACE_COMMENTS,
                workspace_comments
            );
        }
        return root_comment.rootCommentId;
    }
}
