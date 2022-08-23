import { AsyncBlock } from '@toeverything/components/editor-core';

export type TocType = {
    id: string;
    type: string;
    text: string;
};

export const BLOCK_TYPES = {
    GROUP: 'group',
    HEADING1: 'heading1',
    HEADING2: 'heading2',
    HEADING3: 'heading3',
};

/* store page/block unmount-listener */
export const listenerMap = new Map<string, () => void>();

/* 😞😞sorry, I don't know how to define unlimited dimensions array */
const getContentByAsyncBlocks = async (
    asyncBlocks: AsyncBlock[] = [],
    callback: () => void
): Promise<{
    tocContents: any[];
}> => {
    const collect = async (asyncBlocks): Promise<any[]> => {
        /* maybe should recast it to tail recursion */
        return await Promise.all(
            asyncBlocks.map(async (asyncBlock: AsyncBlock) => {
                const asyncBlocks = await asyncBlock.children();

                if (asyncBlocks?.length) {
                    return collect(asyncBlocks);
                }

                /* add only once event listener for every block */
                if (!listenerMap.has(asyncBlock.id)) {
                    /* get update notice */
                    const destroyHandler = asyncBlock.onUpdate(callback);

                    /* collect destroy handlers */
                    listenerMap.set(asyncBlock.id, destroyHandler);
                }

                const { id, type } = asyncBlock;
                if (Object.values(BLOCK_TYPES).includes(type)) {
                    const properties = await asyncBlock.getProperties();

                    return {
                        id,
                        type,
                        text: properties?.text?.value?.[0]?.text || '',
                    };
                }

                return null;
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
const getPageTOC = (asyncBlocks: AsyncBlock[], tocContents): TocType[] => {
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
const destroyEventList = (): boolean => {
    const eventListeners = listenerMap.values();

    for (const eventListener of eventListeners) {
        eventListener?.();
    }

    return true;
};

export { getPageTOC, getContentByAsyncBlocks, destroyEventList };
