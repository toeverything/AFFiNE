import { AddIcon, MoreIcon } from '@toeverything/components/icons';
import {
    Cascader,
    CascaderItemProps,
    IconButton,
    MuiClickAwayListener as ClickAwayListener,
    MuiSnackbar as Snackbar,
    styled,
} from '@toeverything/components/ui';
import { services, TemplateFactory } from '@toeverything/datasource/db-service';
import { useFlag } from '@toeverything/datasource/feature-flags';
import { copyToClipboard } from '@toeverything/utils';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TreeItemMoreActions } from './styles';

const MESSAGES = {
    COPY_LINK_SUCCESS: 'Copyed link to clipboard',
};
interface ActionsProps {
    workspaceId: string;
    pageId: string;
    onRemove: () => void;
}

const StyledAction = styled('div')({
    display: 'flex',
    alignItems: 'center',
});

function DndTreeItemMoreActions(props: ActionsProps) {
    const [alert_open, set_alert_open] = React.useState(false);
    const [anchorEl, setAnchorEl] = React.useState<HTMLDivElement | null>(null);

    const navigate = useNavigate();
    const workspaceId = props.workspaceId;
    const pageId = props.pageId;
    const blockUrl = window.location.origin + `/${workspaceId}/${pageId}`;

    const redirect_to_page = (new_workspaceId: string, newPageId: string) => {
        navigate('/' + new_workspaceId + '/' + newPageId);
    };

    const handle_alert_close = () => {
        set_alert_open(false);
    };
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (anchorEl) {
            setAnchorEl(null);
            return;
        }
        setAnchorEl(event.currentTarget);
    };
    const handleClose = () => {
        setAnchorEl(null);
    };
    const open = Boolean(anchorEl);
    const handle_copy_link = () => {
        copyToClipboard(blockUrl);
        set_alert_open(true);
        handleClose();
    };
    const handle_delete = () => {
        props.onRemove();
        handleClose();
    };
    const handle_new_child_page = async () => {
        const new_page = await services.api.editorBlock.create({
            workspace: workspaceId,
            type: 'page' as const,
        });
        await services.api.pageTree.addChildPageToWorkspace(
            workspaceId,
            pageId,
            new_page.id
        );
        redirect_to_page(workspaceId, new_page.id);

        handleClose();
    };
    const handle_new_prev_page = async () => {
        const new_page = await services.api.editorBlock.create({
            workspace: workspaceId,
            type: 'page' as const,
        });
        await services.api.pageTree.addPrevPageToWorkspace(
            workspaceId,
            pageId,
            new_page.id
        );

        redirect_to_page(workspaceId, new_page.id);

        handleClose();
    };
    const handle_new_next_page = async () => {
        const new_page = await services.api.editorBlock.create({
            workspace: workspaceId,
            type: 'page' as const,
        });
        await services.api.pageTree.addNextPageToWorkspace(
            workspaceId,
            pageId,
            new_page.id
        );

        redirect_to_page(workspaceId, new_page.id);

        handleClose();
    };

    const handle_duplicate_page = async () => {
        //create page
        const new_page = await services.api.editorBlock.create({
            workspace: workspaceId,
            type: 'page' as const,
        });
        //add page to tree
        await services.api.pageTree.addNextPageToWorkspace(
            workspaceId,
            pageId,
            new_page.id
        );
        //copy source page to new page
        await services.api.editorBlock.copyPage(
            workspaceId,
            pageId,
            new_page.id
        );

        redirect_to_page(workspaceId, new_page.id);

        handleClose();
    };

    const redirectToPage = (newWorkspaceId: string, newPageId: string) => {
        navigate('/' + newWorkspaceId + '/' + newPageId);
    };

    const handleNewFromTemplate = async template => {
        const newPage = await services.api.editorBlock.create({
            workspace: workspaceId,
            type: 'page' as const,
        });

        await services.api.pageTree.addNextPageToWorkspace(
            workspaceId,
            pageId,
            newPage.id
        );

        await services.api.editorBlock.copyTemplateToPage(
            workspaceId,
            newPage.id,
            TemplateFactory.generatePageTemplateByGroupKeys({
                name: template.name,
                groupKeys: template.groupKeys,
            })
        );

        redirectToPage(workspaceId, newPage.id);
    };

    const templateList = useFlag(
        'JSONTemplateList',
        TemplateFactory.defaultTemplateList
    );

    const templateMenuList: CascaderItemProps[] = templateList.map(
        (template, index) => {
            const item = {
                title: template.name,
                callback: () => {
                    handleNewFromTemplate(template);
                },
            };
            return item;
        }
    );

    const menuList = [
        {
            title: 'Duplicate Page',
            callback: () => {
                handle_duplicate_page();
            },
        },
        {
            title: '',
            isDivide: true,
        },
        // {
        //     title: 'New Child Page',
        //     callback: () => {
        //         handle_new_child_page();
        //     },
        // },
        // {
        //     title: 'New Prev Page',
        //     callback: () => {
        //         handle_new_prev_page();
        //     },
        // },
        // {
        //     title: 'New Next Page',
        //     callback: () => {
        //         handle_new_next_page();
        //     },
        // },
        {
            title: 'New From Template',
            subItems: templateMenuList,
        },
        {
            title: '',
            isDivide: true,
        },
        {
            title: 'Open In New Tab',
            callback: () => {
                const new_window = window.open(
                    `/${workspaceId}/${pageId}`,
                    '_blank'
                );
                if (new_window) {
                    new_window.focus();
                }
            },
        },
        {
            title: '',
            isDivide: true,
        },
        {
            title: 'Copy Link',
            callback: () => {
                handle_copy_link();
            },
        },
        {
            title: 'Delete',
            callback: () => {
                handle_delete();
            },
        },
    ];

    return (
        <ClickAwayListener onClickAway={() => handleClose()}>
            <div>
                <TreeItemMoreActions>
                    <StyledAction>
                        <IconButton
                            size="small"
                            hoverColor="#E0E6EB"
                            onClick={handle_new_child_page}
                        >
                            <AddIcon />
                        </IconButton>
                        <IconButton
                            size="small"
                            hoverColor="#E0E6EB"
                            onClick={handleClick}
                        >
                            <MoreIcon />
                        </IconButton>
                    </StyledAction>
                </TreeItemMoreActions>

                <Cascader
                    items={menuList}
                    anchorEl={anchorEl}
                    placement="right-start"
                    open={open}
                    onClose={handleClose}
                />
                <Snackbar
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                    open={alert_open}
                    message={MESSAGES.COPY_LINK_SUCCESS}
                    key={'bottomcenter'}
                    autoHideDuration={2000}
                    onClose={handle_alert_close}
                />
            </div>
        </ClickAwayListener>
    );
}

export default DndTreeItemMoreActions;
