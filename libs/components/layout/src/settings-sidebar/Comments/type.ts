import type {
    Comment,
    CommentReply,
} from '@toeverything/datasource/db-service';

export interface CommentInfo extends Comment {
    replyList?: CommentReply[];
    activeCommentId?: string;
    resolveComment: (blockId: string, commentId: string) => void;
}
