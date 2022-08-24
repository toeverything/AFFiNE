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

export const KanbanParentBlockRender = ({
    blockId,
    active,
}: RenderBlockProps & { active?: boolean }) => {
    return (
        <BlockBorder active={active}>
            <BlockWithoutChildrenRender blockId={blockId} />
        </BlockBorder>
    );
};

const KanbanChildrenRender = ({
    blockId,
    activeBlock,
}: RenderBlockProps & { activeBlock?: string | null }) => {
    const { block } = useBlock(blockId);

    if (!block) {
        return null;
    }

    return (
        <BlockRenderProvider blockRender={NullBlockRender}>
            {block?.childrenIds.map(childId => (
                <ChildBorder key={childId} active={activeBlock === childId}>
                    <RenderBlock blockId={childId} />
                </ChildBorder>
            ))}
        </BlockRenderProvider>
    );
};

export const KanbanBlockRender = ({
    blockId,
    activeBlock,
}: RenderBlockProps & { activeBlock?: string | null }) => {
    return (
        <BlockRenderProvider blockRender={NullBlockRender}>
            <KanbanParentBlockRender
                blockId={blockId}
                active={activeBlock === blockId}
            />
            <KanbanChildrenRender blockId={blockId} activeBlock={activeBlock} />
        </BlockRenderProvider>
    );
};

const BlockBorder = styled('div')<{ active?: boolean }>(
    ({ theme, active }) => ({
        borderRadius: '5px',
        padding: '0 4px',
        border: `1px solid ${
            active ? theme.affine.palette.primary : 'transparent'
        }`,
    })
);

const ChildBorder = styled(BlockBorder)(({ active, theme }) => ({
    border: `1px solid  ${active ? theme.affine.palette.primary : '#E0E6EB'}`,
    margin: '4px 0',
}));
