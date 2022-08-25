import { styled } from '@toeverything/components/ui';
import { Protocol } from '@toeverything/datasource/db-service';
import { useEffect, useState } from 'react';
import { AsyncBlock } from '../editor';
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

const useBlockProgress = (block?: AsyncBlock) => {
    // Progress of the progress bar. The range is between 0 and 1.
    // Default progress is 1, that is 100%.
    const [progress, setProgress] = useState(1);

    useEffect(() => {
        if (!block) {
            return;
        }
        const updateProgress = async () => {
            const children = await block.children();
            const todoChildren = children.filter(
                child => child.type === Protocol.Block.Type.todo
            );
            const checkedTodoChildren = todoChildren.filter(
                child => child.getProperty('checked')?.value === true
            );
            setProgress(checkedTodoChildren.length / todoChildren.length);
        };

        updateProgress();

        const unobserve = block.onUpdate(() => {
            updateProgress();
        });

        return unobserve;
    }, [block]);

    return progress;
};

const KanbanChildrenRender = ({
    blockId,
    activeBlock,
}: RenderBlockProps & { activeBlock?: string | null }) => {
    const { block } = useBlock(blockId);
    const progress = useBlockProgress(block);

    if (!block || !block?.childrenIds.length) {
        return null;
    }

    return (
        <BlockRenderProvider blockRender={NullBlockRender}>
            <ProgressBar progress={progress} />
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

const ProgressBar = styled('div')<{ progress?: number }>(
    ({ progress = 1 }) => ({
        height: '3px',
        width: '100%',
        background: '#CFE5FF',
        borderRadius: '5px',
        overflow: 'hidden',
        margin: '12px 0',

        '::after': {
            content: '""',
            position: 'relative',
            display: 'flex',
            background: '#60A5FA',
            height: '100%',
            width: `${(progress * 100).toFixed(2)}%`,
            transition: 'ease 0.5s all',
        },
    })
);

const ChildBorder = styled(BlockBorder)(({ active, theme }) => ({
    border: `1px solid  ${active ? theme.affine.palette.primary : '#E0E6EB'}`,
    margin: '4px 0',
}));
