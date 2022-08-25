import { AsyncBlock } from '@toeverything/components/editor-core';
import { BLOCK_TYPES } from './toc-enum';
import type { ListenerMap, TOCType } from './types';

/* 😞😞sorry, I don't know how to define unlimited dimensions array */
const getContentByAsyncBlocks = async (
    asyncBlocks: AsyncBlock[] = [],
    callback: () => void,
    listenerMap: ListenerMap
): Promise<{
    tocContents: any[];
}> => {
    const collect = async (asyncBlocks): Promise<any[]> => {
        /* maybe should recast it to tail recursion */
        return await Promise.all(
            asyncBlocks.map(async (asyncBlock: AsyncBlock) => {
                const asyncBlocks = await asyncBlock?.children();

                if (asyncBlocks?.length) {
                    return collect(asyncBlocks);
                }

                /* add only once event listener for every block */
                if (!listenerMap.has(asyncBlock?.id)) {
                    /* get update notice */
                    const destroyHandler = asyncBlock?.onUpdate(callback);

                    /* collect destroy handlers */
                    listenerMap.set(asyncBlock?.id, destroyHandler);
                }

                const { id, type } = asyncBlock;

                switch (type) {
                    case BLOCK_TYPES.GROUP:
                    case BLOCK_TYPES.HEADING1:
                    case BLOCK_TYPES.HEADING2:
                    case BLOCK_TYPES.HEADING3: {
                        const properties = await asyncBlock?.getProperties();

                        return {
                            id,
                            type,
                            text: properties?.text?.value?.[0]?.text || '',
                        };
                    }
                    default:
                        return null;
                }
            })
        );
    };

    return {
        tocContents: await collect(asyncBlocks),
    };
};

/**
 * get flat toc
 * @param asyncBlocks
 * @param tocContents
 */
const getPageTOC = (asyncBlocks: AsyncBlock[], tocContents): TOCType[] => {
    return tocContents
        .reduce((tocGroupContent, tocContent, index) => {
            const { id, type } = asyncBlocks[index];
            const groupContent = {
                id,
                type,
                text: 'Untitled Group',
            };

            tocGroupContent.push(
                !tocContent.flat(Infinity).filter(Boolean).length
                    ? groupContent
                    : tocContent
            );

            return tocGroupContent;
        }, [])
        .flat(Infinity)
        .filter(Boolean);
};

/* destroy page/block update-listener */
const destroyEventList = (listenerMap: ListenerMap) => {
    const eventListeners = listenerMap.values();
    listenerMap.clear();

    for (const eventListener of eventListeners) {
        eventListener?.();
    }
};

export { getPageTOC, getContentByAsyncBlocks, destroyEventList };
