import { defaultStyle, Editor } from '@toeverything/components/board-shapes';
import type { TDShape } from '@toeverything/components/board-types';
import type { ReturnEditorBlock } from '@toeverything/datasource/db-service';
import { services } from '@toeverything/datasource/db-service';
import { usePageClientWidth } from '@toeverything/datasource/state';
import { useEffect, useState } from 'react';

export const useShapes = (workspace: string, rootBlockId: string) => {
    const { pageClientWidth } = usePageClientWidth();
    // page padding left and right total 300px
    const editorShapeInitSize = pageClientWidth - 300;
    const [blocks, setBlocks] = useState<{
        shapes: [ReturnEditorBlock[]];
    }>();

    useEffect(() => {
        const unobservesMap = new Map();
        const observeChild = async (childId: string) => {
            unobservesMap.set(
                childId,
                await services.api.editorBlock.observe(
                    { workspace, id: childId },
                    blockData => {
                        setBlocks(data => {
                            const blockShapes = data?.shapes?.[0];
                            const idx =
                                blockShapes.findIndex(
                                    s => s.id === blockData.id
                                ) || -1;
                            const newBlockShapes = [...blockShapes];
                            if (idx > -1) {
                                newBlockShapes[idx] = blockData;
                            } else {
                                newBlockShapes.push(blockData);
                            }
                            return {
                                shapes: [newBlockShapes],
                            };
                        });
                    }
                )
            );
        };
        Promise.all([
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
                            observeChild(childBlock.id);
                            return childBlock;
                        })
                    );
                    return shapes;
                }),
        ]).then(shapes => {
            setBlocks({
                shapes: shapes,
            });
        });

        let unobserve: () => void;
        services.api.editorBlock
            .observe({ workspace, id: rootBlockId }, async blockData => {
                Promise.all(
                    (blockData?.children || []).map(async childId => {
                        const childBlock = (
                            await services.api.editorBlock.get({
                                workspace,
                                ids: [childId],
                            })
                        )?.[0];
                        if (!unobservesMap.has(childBlock.id)) {
                            observeChild(childBlock.id);
                        }
                        return childBlock;
                    })
                ).then(shapes => {
                    setBlocks({
                        shapes: [shapes],
                    });
                });
            })
            .then(cb => {
                unobserve = cb;
            });

        return () => {
            unobserve?.();
        };
    }, [workspace, rootBlockId]);

    let groupCount = 0;
    const blocksShapes = blocks?.shapes[0]?.reduce((acc, block) => {
        const shapeProps = block.properties.shapeProps?.value
            ? JSON.parse(block.properties.shapeProps.value)
            : {};
        if (block.type === 'shape') {
            acc[block.id] = {
                type: 'rectangle',
                size: [0, 0],
                point: [0, 0],
                parentId: rootBlockId,
                ...shapeProps,
                id: block.id,
                style: { ...defaultStyle, ...(shapeProps.style || {}) },
                workspace,
            };
        } else {
            acc[block.id] = Editor.getShape({
                point: [groupCount * editorShapeInitSize + 200, 200],
                id: block.id,
                size: [editorShapeInitSize, 200],
                parentId: rootBlockId,
                ...shapeProps,
                affineId: shapeProps.affineId ?? block.id,
                workspace: block.workspace,
                rootBlockId: block.id,
            });
            groupCount = groupCount + 1;
        }

        return acc;
    }, {} as Record<string, TDShape>);
    console.log('useShapes', blocksShapes);

    return {
        shapes: blocksShapes,
    };
};
