import type { CommentReply } from '@toeverything/datasource/db-service';

import { CommentContent } from './CommentContent';
import { CommentedByUser } from './CommentedByUser';

export const ReplyItem = (props: CommentReply) => {
    const { creator, lastUpdated, content } = props;

    return (
        <>
            <CommentedByUser username={creator} updateTime={lastUpdated} />
            <CommentContent content={content.value[0].text} />
        </>
    );
};
