import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Typography, styled } from '@toeverything/components/ui';

import { services } from '@toeverything/datasource/db-service';

/* card.7: Demand changes, temporarily closed, see https://github.com/toeverything/AFFiNE/issues/522 */
// import { usePageTree} from '@toeverything/components/layout';
// import { pickPath } from './utils';

export const CurrentPageTitle = () => {
    const params = useParams();
    const { workspace_id } = params;
    const [pageId, setPageId] = useState<string>('');
    const [pageTitle, setPageTitle] = useState<string | undefined>();
    /* card.7 */
    // const { items } = usePageTree();

    useEffect(() => {
        if (params['*']) {
            setPageId(params['*'].split('/')[0]);
        }
    }, [params]);

    const fetchPageTitle = useCallback(async () => {
        if (!workspace_id || !pageId) return;
        const [pageEditorBlock] = await services.api.editorBlock.get({
            workspace: workspace_id,
            ids: [pageId],
        });
        /* card.7 */
        /* If the id is unique, only one path will be matched */
        // const routes = pickPath(items, pageId).filter(item => item.length)?.[0];

        setPageTitle(
            pageEditorBlock?.properties?.text?.value
                ?.map(v => v.text)
                .join('') ?? 'Untitled'
        );
    }, [pageId, workspace_id]);

    useEffect(() => {
        fetchPageTitle();
    }, [fetchPageTitle]);

    useEffect(() => {
        if (!workspace_id || !pageId || pageTitle === undefined)
            return () => {};

        let unobserve: () => void;
        const auto_update_title = async () => {
            // console.log(';; title registration auto update');
            unobserve = await services.api.editorBlock.observe(
                { workspace: workspace_id, id: pageId },
                businessBlock => {
                    // console.log(';; auto_update_title', businessBlock);
                    fetchPageTitle();
                }
            );
        };
        auto_update_title();

        return () => {
            // unobserve?.();
        };
    }, [fetchPageTitle, pageId, pageTitle, workspace_id]);

    useEffect(() => {
        document.title = pageTitle || '';
    }, [pageTitle]);

    return pageTitle ? (
        <ContentText type="sm" title={pageTitle}>
            {pageTitle}
        </ContentText>
    ) : null;
};

const ContentText = styled(Typography)(({ theme }) => {
    return {
        color: theme.affine.palette.primaryText,
        maxWidth: '240px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    };
});
