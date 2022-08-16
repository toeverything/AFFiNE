import { memo, useEffect } from 'react';
import { useParams } from 'react-router';

import { AffineBoard } from '@toeverything/components/affine-board';
import { services } from '@toeverything/datasource/db-service';
import { useUserAndSpaces } from '@toeverything/datasource/state';

const MemoAffineBoard = memo(AffineBoard, (prev, next) => {
    return prev.rootBlockId === next.rootBlockId;
});

type EdgelessProps = {
    workspace: string;
};

export const Edgeless = (props: EdgelessProps) => {
    const { page_id } = useParams();
    const { user } = useUserAndSpaces();

    useEffect(() => {
        if (!user?.id || !props.workspace) return;
        const update_recent_pages = async () => {
            // TODO: deal with it temporarily
            await services.api.editorBlock.getWorkspaceDbBlock(
                props.workspace,
                {
                    userId: user.id,
                }
            );
        };
        update_recent_pages();
    }, [user, props.workspace]);

    return (
        <MemoAffineBoard workspace={props.workspace} rootBlockId={page_id} />
    );
};
