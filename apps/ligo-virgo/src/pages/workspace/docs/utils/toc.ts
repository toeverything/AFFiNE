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

/* 😞😞sorry, I don't know how to define unlimited dimensions array */
const getContentByAsyncBlocks = async (
    asyncBlocks: AsyncBlock[] = [],
    callback: () => void
): Promise<{
    tocContents: any[];
    eventListeners: (() => void | undefined)[];
}> => {
    const eventListeners = [];

    const collect = async (asyncBlocks): Promise<any[]> => {
        /* maybe should recast it to tail recursion */
        return await Promise.all(
            asyncBlocks.map(async (asyncBlock: AsyncBlock) => {
                const asyncBlocks = await asyncBlock.children();

                if (asyncBlocks?.length) {
                    return collect(asyncBlocks);
                }

                /* get update notice */
                const destroyHandler = asyncBlock.onUpdate(callback);

                /* collect destroy handlers */
                eventListeners.push(destroyHandler);

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
        eventListeners,
    };
};

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

const destroyEventList = (
    eventListeners: (() => void | undefined)[] = []
): boolean => {
    for (const eventListener of eventListeners) {
        eventListener?.();
    }

    return true;
};

export { getPageTOC, getContentByAsyncBlocks, destroyEventList };
