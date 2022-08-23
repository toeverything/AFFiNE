import type { BlockEditor } from '@toeverything/components/editor-core';

export const BLOCK_TYPES = {
    GROUP: 'group',
    HEADING1: 'heading1',
    HEADING2: 'heading2',
    HEADING3: 'heading3',
};

const getContentByAsyncBlocks = async (asyncBlocks = []) => {
    /* maybe should recast it to tail recursion */
    return await Promise.all(
        asyncBlocks.map(async asyncBlock => {
            const asyncBlocks = await asyncBlock.children();

            if (asyncBlocks?.length) {
                return getContentByAsyncBlocks(asyncBlocks);
            }

            const { id, type } = asyncBlock;

            if (Object.values(BLOCK_TYPES).includes(type)) {
                const properties = await asyncBlock.getProperties();

                return {
                    id: id,
                    type,
                    text: properties?.text?.value?.[0]?.text || '',
                };
            }

            return null;
        })
    );
};

const getPageContentById = async (editor: BlockEditor, pageId: string) => {
    const { children = [] } = (await editor.queryByPageId(pageId))?.[0] || {};
    const asyncBlocks = (await editor.getBlockByIds(children)) || [];

    const tocContents = await getContentByAsyncBlocks(asyncBlocks);

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

export { getPageContentById };
