import { nanoid } from 'nanoid';
import { memo, useEffect, useRef, useState } from 'react';

import { StyledBlockPreview } from '@toeverything/components/common';
import { AsyncBlock, useEditor } from '@toeverything/components/editor-core';
import { services } from '@toeverything/datasource/db-service';
import { debounce, sleep } from '@toeverything/utils';

const updateTitle = async (
    workspace: string,
    blockId: string,
    onFinal: (title?: string) => void,
    retry = 0
) => {
    const [page] = await services.api.editorBlock.search(workspace, {
        tag: `id:${blockId}`,
    });
    if (page?.content) {
        onFinal(page?.content);
    } else if (retry < 20) {
        await sleep(500);
        updateTitle(workspace, blockId, onFinal, retry + 1);
    } else {
        onFinal('Untitled');
    }
};

const bindBlock = async (
    handleId: string,
    workspace: string,
    blockId: string,
    onFinal: (title: string) => void,
    retry = 0
): Promise<() => void> | undefined => {
    const block = await services.api.editorBlock.getBlock(workspace, blockId);
    if (block.id === blockId) {
        const debouncedOnFinal = debounce(onFinal, 100, { maxWait: 500 });
        const onUpdated = () =>
            updateTitle(workspace, blockId, debouncedOnFinal);
        block.on('content', handleId, onUpdated);
        onUpdated();
        return () => block.off('content', handleId);
    } else if (retry < 20) {
        await sleep(500);
        return bindBlock(handleId, workspace, blockId, onFinal, retry + 1);
    } else {
        onFinal('Untitled');
        return undefined;
    }
};

const useBlockTitle = (block: AsyncBlock, blockId: string) => {
    const [title, setTitle] = useState('Loading...');

    useEffect(() => {
        let callback: any = undefined;

        bindBlock(
            block.id + nanoid(8),
            block.workspace,
            blockId,
            setTitle
        ).then(cb => {
            callback = cb;
        });

        return () => callback?.();
    }, [block.id, block.workspace, blockId]);

    return title;
};

type BlockPreviewProps = {
    block: AsyncBlock;
    blockId: string;
};

const InternalBlockPreview = (props: BlockPreviewProps) => {
    const container = useRef<HTMLDivElement>();
    const [preview, setPreview] = useState(true);
    const title = useBlockTitle(props.block, props.blockId);
    const { editorElement } = useEditor();

    const AffineEditor = editorElement as any;

    useEffect(() => {
        if (container?.current) {
            const element = container?.current;
            const resizeObserver = new IntersectionObserver(entries => {
                const height = entries?.[0]?.intersectionRect.height;
                setPreview(height < 174);
            });

            resizeObserver.observe(element);
            return () => resizeObserver.unobserve(element);
        }
        return undefined;
    }, [container, props]);

    return (
        <div ref={container}>
            <StyledBlockPreview title={title}>
                {preview ? (
                    <span
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            fontSize: '128px',
                            height: '480px',
                            alignItems: 'center',
                            color: '#5591ff',
                        }}
                    >
                        Preview
                    </span>
                ) : AffineEditor ? (
                    <AffineEditor
                        workspace={props.block.workspace}
                        rootBlockId={props.blockId}
                    />
                ) : null}
            </StyledBlockPreview>
        </div>
    );
};

export const BlockPreview = memo(InternalBlockPreview, (prev, next) => {
    return (
        prev.block.workspace === next.block.workspace &&
        prev.blockId === next.blockId
    );
});
