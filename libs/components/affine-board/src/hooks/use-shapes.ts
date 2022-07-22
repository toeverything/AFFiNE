import { useEffect, useState } from 'react';
import { services } from '@toeverything/datasource/db-service';
import type { ReturnEditorBlock } from '@toeverything/datasource/db-service';
import type { TDShape } from '@toeverything/components/board-types';
import { Editor } from '@toeverything/components/board-shapes';

export const useShapes = (workspace: string, rootBlockId: string) => {
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
                point: [groupCount * 740, 200],
                id: block.id,
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
