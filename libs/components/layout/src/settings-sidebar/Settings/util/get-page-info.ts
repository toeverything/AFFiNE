import { services } from '@toeverything/datasource/db-service';
import { useEffect, useState } from 'react';

const UNTITLED = 'untitled';

interface GetPageTitleProps {
    workspaceId: string;
    pageId: string;
}

export const getPageTitle = async ({
    workspaceId,
    pageId,
}: GetPageTitleProps) => {
    return await services.api.editorBlock
        .get({ workspace: workspaceId, ids: [pageId] })
        .then(blockData => {
            if (!blockData?.[0]) {
                return UNTITLED;
            }
            return blockData[0].properties.text.value.map(v => v.text).join('');
        });
};

const getPageLastUpdated = async ({
    workspaceId,
    pageId,
}: GetPageTitleProps) => {
    return await services.api.editorBlock
        .getBlock(workspaceId, pageId)
        .then(block => {
            if (!block) {
                return null;
            }
            return block.lastUpdated;
        });
};

export const usePageLastUpdated = ({
    workspaceId,
    pageId,
}: GetPageTitleProps) => {
    const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
    useEffect(() => {
        getPageLastUpdated({ workspaceId, pageId }).then(d => {
            setLastUpdated(d ? d : Date.now());
        });
    }, [workspaceId, pageId]);
    return lastUpdated;
};
