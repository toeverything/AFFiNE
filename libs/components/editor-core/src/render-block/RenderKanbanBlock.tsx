import { styled } from '@toeverything/components/ui';
import { useBlock } from '../hooks';
import { BlockRenderProvider } from './Context';
import { NullBlockRender, RenderBlock, RenderBlockProps } from './RenderBlock';

/**
 * Render block without children.
 */
const BlockWithoutChildrenRender = ({ blockId }: RenderBlockProps) => {
    return (
        <BlockRenderProvider blockRender={NullBlockRender}>
            <RenderBlock blockId={blockId} />
        </BlockRenderProvider>
    );
};

/**
 * Render a block, but only one level of children.
 */
const OneLevelBlockRender = ({ blockId }: RenderBlockProps) => {
    return (
        <BlockRenderProvider blockRender={BlockWithoutChildrenRender}>
            <RenderBlock blockId={blockId} />
        </BlockRenderProvider>
    );
};

export const KanbanBlockRender = ({ blockId }: RenderBlockProps) => {
    const { block } = useBlock(blockId);

    if (!block) {
        return (
            <BlockRenderProvider blockRender={NullBlockRender}>
                <RenderBlock blockId={blockId} />
            </BlockRenderProvider>
        );
    }

    return (
        <BlockRenderProvider blockRender={NullBlockRender}>
            <RenderBlock blockId={blockId} />
            {block?.childrenIds.map(childId => (
                <StyledBorder key={childId}>
                    <RenderBlock blockId={childId} />
                </StyledBorder>
            ))}
        </BlockRenderProvider>
    );
};

const StyledBorder = styled('div')({
    border: '1px solid #E0E6EB',
    borderRadius: '5px',
    margin: '4px',
    padding: '0 4px',
});
