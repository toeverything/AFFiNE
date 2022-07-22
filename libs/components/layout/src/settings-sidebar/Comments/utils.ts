import type {
    ReturnEditorBlock,
    Comment,
} from '@toeverything/datasource/db-service';

export const getCommentsFromEditorBlocks = (
    editorBlocks: ReturnEditorBlock[]
) => {
    return [] as Comment[];
};

export const getCommentReplyFromEditorBlock = (
    editorBlock: ReturnEditorBlock
) => {
    return {};
};
