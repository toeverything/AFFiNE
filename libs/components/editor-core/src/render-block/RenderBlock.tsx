import { styled } from '@toeverything/components/ui';
import { useCallback, useMemo } from 'react';

import { useEditor } from '../Contexts';
import { useBlock } from '../hooks';

interface RenderBlockProps {
    blockId: string;
    hasContainer?: boolean;
}

export function RenderBlock({
    blockId,
    hasContainer = true,
}: RenderBlockProps) {
    const { editor, editorElement } = useEditor();
    const { block } = useBlock(blockId);

    const setRef = useCallback(
        (dom: HTMLElement) => {
            if (block != null && dom != null) {
                block.dom = dom;
            }
        },
        [block]
    );

    const blockView = useMemo(() => {
        if (block?.type) {
            return editor.getView(block.type);
        }
        return null;
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

    const view = blockView?.View ? (
        <blockView.View
            editor={editor}
            block={block}
            columns={columns.columns}
            columnsFromId={columns.fromId}
            editorElement={editorElement}
        />
    ) : null;

    return hasContainer ? (
        <BlockContainer block-id={blockId} ref={setRef} data-block-id={blockId}>
            {view}
        </BlockContainer>
    ) : (
        <> {view}</>
    );
}

const BlockContainer = styled('div')(({ theme }) => ({
    fontSize: theme.typography.body1.fontSize,
}));
