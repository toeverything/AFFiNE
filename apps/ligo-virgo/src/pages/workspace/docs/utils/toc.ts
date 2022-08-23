import { AsyncBlock } from '@toeverything/components/editor-core';

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
): Promise<any[]> => {
    /* maybe should recast it to tail recursion */
    return await Promise.all(
        asyncBlocks.map(async (asyncBlock: AsyncBlock) => {
            const asyncBlocks = await asyncBlock.children();

            if (asyncBlocks?.length) {
                return getContentByAsyncBlocks(asyncBlocks, callback);
            }

            /* get update notice */
            asyncBlock.onUpdate(callback);

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

const getPageTOC = (asyncBlocks: AsyncBlock[], tocContents) => {
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

export { getPageTOC, getContentByAsyncBlocks };
