import { styled } from '@toeverything/components/ui';
import { useCallback, useMemo } from 'react';

import { useEditor } from '../Contexts';
import { useBlock } from '../hooks';

/**
 * Render nothing
 */
export const NullBlockRender = (): null => null;

export interface RenderBlockProps {
    blockId: string;
    hasContainer?: boolean;
}

export function RenderBlock({
    blockId,
    hasContainer = true,
}: RenderBlockProps) {
    const { editor } = useEditor();
    const { block } = useBlock(blockId);

    const setRef = useCallback(
        (dom: HTMLElement) => {
            if (block != null && dom != null) {
                block.dom = dom;
            }
        },
        [block]
    );

    const BlockView = useMemo(() => {
        if (block?.type) {
            return editor.getView(block.type).View;
        }
        return (): null => null;
    }, [editor, block?.type]);

    if (!block) {
        return null;
    }

    /**
     * @deprecated
     */
    const columns = {
        fromId: block.id ?? '',
        columns: block.columns ?? [],
    };

    const view = (
        <BlockView
            editor={editor}
            block={block}
            columns={columns.columns}
            columnsFromId={columns.fromId}
        />
    );

    return hasContainer ? (
        <BlockContainer block-id={blockId} ref={setRef} data-block-id={blockId}>
            {view}
        </BlockContainer>
    ) : (
        view
    );
}

const BlockContainer = styled('div')(({ theme }) => ({
    fontSize: theme.typography.body1.fontSize,
}));
