import { AddIcon } from '@toeverything/components/icons';
import {
    useCalendarHeatmap,
    usePageTree,
} from '@toeverything/components/layout';
import {
    IconButton,
    MuiBox as Box,
    MuiCollapse as Collapse,
    styled,
} from '@toeverything/components/ui';
import { services } from '@toeverything/datasource/db-service';
import React, { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const StyledBtn = styled('div')({
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    color: '#98ACBD',
    textTransform: 'none',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    userSelect: 'none',
    flex: 1,
    marginLeft: '12px',
});

export type CollapsiblePageTreeProps = {
    title?: string;
    initialOpen?: boolean;
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
};

export function CollapsiblePageTree(props: CollapsiblePageTreeProps) {
    const { className, style, children, title, initialOpen = true } = props;
    const navigate = useNavigate();
    const { workspaceId, pageId } = useParams();

    const { handleAddPage } = usePageTree();
    const { addPageToday } = useCalendarHeatmap();

    const [open, setOpen] = useState(initialOpen);

    const create_page = useCallback(async () => {
        if (pageId) {
            const newPage = await services.api.editorBlock.create({
                workspace: workspaceId,
                type: 'page' as const,
            });

            await handleAddPage(newPage.id);
            addPageToday();

            navigate(`/${workspaceId}/${newPage.id}`);
        }
    }, [addPageToday, handleAddPage, navigate, pageId, workspaceId]);

    const [newPageBtnVisible, setNewPageBtnVisible] = useState<boolean>(false);

    return (
        <>
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingRight: '12px',
                    '&:hover': {
                        background: '#f5f7f8',
                        borderRadius: '5px',
                    },
                }}
                onMouseEnter={() => setNewPageBtnVisible(true)}
                onMouseLeave={() => setNewPageBtnVisible(false)}
            >
                <StyledBtn onClick={() => setOpen(prev => !prev)}>
                    {title}
                </StyledBtn>

                {newPageBtnVisible && (
                    <IconButton
                        size="small"
                        hoverColor="#E0E6EB"
                        onClick={create_page}
                    >
                        <AddIcon />
                    </IconButton>
                )}
            </Box>
            {children ? (
                <Collapse in={open} timeout="auto" unmountOnExit>
                    {children}
                </Collapse>
            ) : null}
        </>
    );
}

export default CollapsiblePageTree;
