import { Virgo } from '@toeverything/framework/virgo';
import { useCallback, useEffect, useState } from 'react';

import { BaseButton, styled } from '@toeverything/components/ui';
import {
    services,
    TemplateFactory,
    TemplateMeta,
    type ReturnUnobserve,
} from '@toeverything/datasource/db-service';

const PlaceholderPanelContainer = styled('div')({
    position: 'fixed',
    top: '0px',
    fontSize: '16px',
    lineHeight: '22px',
    opacity: '0.333',
});

const TemplateItemContainer = styled('div')({
    '&:hover': {
        backgroundColor: '#eee',
        cursor: 'pointer',
    },
});

const EmptyPageTipContainer = styled('div')({
    cursor: 'pointer',
    '&:hover': {
        backgroundColor: '#eee',
        cursor: 'pointer',
    },
});

type PlaceholderPanelProps = {
    editor: Virgo;
    onClickTips?: () => void;
};

export const PlaceholderPanel = (props: PlaceholderPanelProps) => {
    const editor = props.editor;
    const workspaceId = editor.workspace;

    const [point, setPoint] = useState({
        x: 0,
        y: 0,
    });
    const [open, setOpen] = useState(false);

    const ifPageChildrenExist = useCallback(async () => {
        const rootId = await editor.getRootBlockId();
        const dbPageBlock = await services.api.editorBlock.getBlock(
            workspaceId,
            rootId
        );
        if (!dbPageBlock) return;
        if (dbPageBlock.children && dbPageBlock.children.length > 0) {
            setOpen(false);
        } else {
            if (open) {
                return;
            }
            setOpen(true);
            adjustPosition();
        }
    }, [
        editor,
        workspaceId,
        editor.getRootBlockId,
        open,
        services.api.editorBlock.getBlock,
    ]);

    useEffect(() => {
        let unobserve: ReturnUnobserve | undefined = undefined;
        const observe = async () => {
            const rootId = await editor.getRootBlockId();

            unobserve = await services.api.editorBlock.observe(
                {
                    workspace: workspaceId,
                    id: rootId,
                },
                () => {
                    ifPageChildrenExist();
                }
            );
        };
        observe();

        return () => {
            unobserve?.();
        };
    }, [editor, workspaceId, editor.getRootBlockId, ifPageChildrenExist]);

    const adjustPosition = useCallback(async () => {
        //@ts-ignore
        const rootBlockDom = await editor.getBlockDomById(
            editor.getRootBlockId()
        );
        const { x, y } = rootBlockDom.getBoundingClientRect();
        setPoint({
            x,
            y: y + 60,
        });
        //@ts-ignore
    }, [editor, editor.getRootBlockId, editor.getBlockDomById]);

    useEffect(() => {
        let unobserve: () => void;
        const observerePageTreeChange = async () => {
            unobserve = await services.api.pageTree.observe(
                { workspace: workspaceId, page: editor.getRootBlockId() },
                ifPageChildrenExist
            );
        };
        observerePageTreeChange();

        return () => {
            unobserve?.();
        };
    }, [editor, workspaceId, editor.getRootBlockId, ifPageChildrenExist, open]);

    useEffect(() => {
        ifPageChildrenExist();
    }, [editor, ifPageChildrenExist, open]);

    const handleClickEmptyPage = async () => {
        const rootBlockId = await editor.getRootBlockId();
        await services.api.editorBlock.copyTemplateToPage(
            workspaceId,
            rootBlockId,
            TemplateFactory.generatePageTemplateByGroupKeys({
                name: 'Empty Page',
                groupKeys: ['empty'],
            })
        );
        setOpen(false);
        props.onClickTips();
    };
    const templateList = TemplateFactory.defaultTemplateList;
    const handleNewFromTemplate = async (template: TemplateMeta) => {
        const pageId = await editor.getRootBlockId();
        const newPage = await services.api.editorBlock.getBlock(
            workspaceId,
            pageId
        );

        await services.api.editorBlock.copyTemplateToPage(
            workspaceId,
            newPage.id,
            TemplateFactory.generatePageTemplateByGroupKeys(template)
        );

        // redirectToPage(workspaceId, newPage.id);

        // handleClose();
        setOpen(false);
    };
    return (
        <PlaceholderPanelContainer
            style={{
                top: point.y + 'px',
                left: point.x + 'px',
                display: open ? 'block' : 'none',
            }}
        >
            <EmptyPageTipContainer onClick={handleClickEmptyPage}>
                Press Enter to continue with an empty page, or pick a template
            </EmptyPageTipContainer>
            <div style={{ marginTop: '4px', marginLeft: '-8px' }}>
                {templateList.map((template, index) => {
                    return (
                        <TemplateItemContainer
                            key={index}
                            onClick={() => {
                                handleNewFromTemplate(template);
                            }}
                        >
                            <BaseButton>{template.name}</BaseButton>
                        </TemplateItemContainer>
                    );
                })}
            </div>
        </PlaceholderPanelContainer>
    );
};
