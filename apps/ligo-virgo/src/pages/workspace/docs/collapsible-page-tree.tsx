import React, { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    MuiBox as Box,
    MuiButton as Button,
    MuiCollapse as Collapse,
    MuiIconButton as IconButton,
    styled,
} from '@toeverything/components/ui';
import {
    ArrowDropDownIcon,
    ArrowRightIcon,
} from '@toeverything/components/icons';
import { services } from '@toeverything/datasource/db-service';
import {
    usePageTree,
    useCalendarHeatmap,
} from '@toeverything/components/layout';
import { AddIcon } from '@toeverything/components/icons';

const StyledContainer = styled('div')({
    height: '32px',
    display: 'flex',
    alignItems: 'center',
});

const StyledBtn = styled('div')({
    color: '#98ACBD',
    textTransform: 'none',
    fontSize: '12px',
    fontWeight: '600',
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
    const { workspace_id, page_id } = useParams();

    const { handleAddPage } = usePageTree();
    const { addPageToday } = useCalendarHeatmap();

    const [open, setOpen] = useState(initialOpen);

    const create_page = useCallback(async () => {
        if (page_id) {
            const newPage = await services.api.editorBlock.create({
                workspace: workspace_id,
                type: 'page' as const,
            });

            await handleAddPage(newPage.id);
            addPageToday();

            navigate(`/${workspace_id}/${newPage.id}`);
        }
    }, [addPageToday, handleAddPage, navigate, page_id, workspace_id]);

    const [newPageBtnVisible, setNewPageBtnVisible] = useState<boolean>(false);

    return (
        <>
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingRight: 1,
                    '&:hover': {
                        background: '#f5f7f8',
                        borderRadius: '5px',
                    },
                }}
                onMouseEnter={() => setNewPageBtnVisible(true)}
                onMouseLeave={() => setNewPageBtnVisible(false)}
            >
                <StyledContainer>
                    {open ? (
                        <ArrowDropDownIcon sx={{ color: '#566B7D' }} />
                    ) : (
                        <ArrowRightIcon sx={{ color: '#566B7D' }} />
                    )}
                    <StyledBtn onClick={() => setOpen(prev => !prev)}>
                        {title}
                    </StyledBtn>
                </StyledContainer>

                {newPageBtnVisible && (
                    <AddIcon
                        style={{
                            width: '20px',
                            height: '20px',
                            color: '#98ACBD',
                            cursor: 'pointer',
                        }}
                        onClick={create_page}
                    />
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
