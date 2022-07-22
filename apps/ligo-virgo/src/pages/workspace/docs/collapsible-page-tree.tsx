import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import style9 from 'style9';
import {
    MuiBox as Box,
    MuiButton as Button,
    MuiCollapse as Collapse,
    MuiIconButton as IconButton,
} from '@toeverything/components/ui';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';

import { services } from '@toeverything/datasource/db-service';
import { NewpageIcon } from '@toeverything/components/common';
import {
    usePageTree,
    useCalendarHeatmap,
} from '@toeverything/components/layout';

const styles = style9.create({
    ligoButton: {
        textTransform: 'none',
    },
    newPage: {
        color: '#B6C7D3',
        width: '26px',
        fontSize: '18px',
        textAlign: 'center',
        cursor: 'pointer',
    },
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
                }}
                onMouseEnter={() => setNewPageBtnVisible(true)}
                onMouseLeave={() => setNewPageBtnVisible(false)}
            >
                <Button
                    startIcon={
                        open ? <ArrowDropDownIcon /> : <ArrowRightIcon />
                    }
                    onClick={() => setOpen(prev => !prev)}
                    sx={{ color: '#566B7D', textTransform: 'none' }}
                    className={clsx(styles('ligoButton'), className)}
                    style={style}
                    disableElevation
                    disableRipple
                >
                    {title}
                </Button>

                {newPageBtnVisible && (
                    <div
                        onClick={create_page}
                        className={clsx(styles('newPage'), className)}
                    >
                        +
                    </div>
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
