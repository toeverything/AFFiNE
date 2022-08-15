import { Editor } from '@toeverything/components/board-shapes';
import type { TDShape } from '@toeverything/components/board-types';
import type { ReturnEditorBlock } from '@toeverything/datasource/db-service';
import { services } from '@toeverything/datasource/db-service';
import { usePageClientWidth } from '@toeverything/datasource/state';
import { useEffect, useState } from 'react';

export const useShapes = (workspace: string, rootBlockId: string) => {
    const { pageClientWidth } = usePageClientWidth();
    // page padding left and right total 300px
    const editorShapeInitSize = pageClientWidth - 300;
    const [blocks, setBlocks] = useState<ReturnEditorBlock[]>();
    useEffect(() => {
        services.api.editorBlock
            .get({ workspace, ids: [rootBlockId] })
            .then(async blockData => {
                const shapes = await Promise.all(
                    (blockData?.[0]?.children || []).map(async childId => {
                        const childBlock = (
                            await services.api.editorBlock.get({
                                workspace,
                                ids: [childId],
                            })
                        )?.[0];
                        return childBlock;
                    })
                );
                setBlocks(shapes);
            });
        let unobserve: () => void;
        services.api.editorBlock
            .observe({ workspace, id: rootBlockId }, async blockData => {
                const shapes = await Promise.all(
                    (blockData?.children || []).map(async childId => {
                        const childBlock = (
                            await services.api.editorBlock.get({
                                workspace,
                                ids: [childId],
                            })
                        )?.[0];
                        return childBlock;
                    })
                );
                setBlocks(shapes);
            })
            .then(cb => {
                unobserve = cb;
            });

        return () => {
            unobserve?.();
        };
    }, [workspace, rootBlockId]);

    let groupCount = 0;

    return blocks?.reduce((acc, block) => {
        const shapeProps = block.properties.shapeProps?.value
            ? JSON.parse(block.properties.shapeProps.value)
            : {};
        if (block.type === 'shape') {
            acc[block.id] = { ...shapeProps, id: block.id };
        } else {
            acc[block.id] = Editor.getShape({
                point: [groupCount * editorShapeInitSize + 200, 200],
                id: block.id,
                size: [editorShapeInitSize, 200],
                ...shapeProps,
                affineId: shapeProps.affineId ?? block.id,
                workspace: block.workspace,
                rootBlockId: block.id,
            });
            groupCount = groupCount + 1;
        }

        return acc;
    }, {} as Record<string, TDShape>);
};
