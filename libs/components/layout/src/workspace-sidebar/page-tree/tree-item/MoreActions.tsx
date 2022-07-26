import styles from './tree-item.module.scss';
import {
    MuiSnackbar as Snackbar,
    Cascader,
    CascaderItemProps,
    MuiDivider as Divider,
} from '@toeverything/components/ui';
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { copyToClipboard } from '@toeverything/utils';
import { services, TemplateFactory } from '@toeverything/datasource/db-service';
import { NewFromTemplatePortal } from './NewFromTemplatePortal';
import { useFlag } from '@toeverything/datasource/feature-flags';
const MESSAGES = {
    COPY_LINK_SUCCESS: 'Copyed link to clipboard',
};
interface ActionsProps {
    workspaceId: string;
    pageId: string;
    onRemove: () => void;
}
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
        <>
            <span
                className={styles['TreeItemMoreActions']}
                onClick={handleClick}
            >
                ···
            </span>
            <Cascader
                items={menuList}
                anchorEl={anchorEl}
                placement="right-start"
                open={open}
                onClose={handleClose}
            ></Cascader>
            <Snackbar
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                open={alert_open}
                message={MESSAGES.COPY_LINK_SUCCESS}
                key={'bottomcenter'}
                autoHideDuration={2000}
                onClose={handle_alert_close}
            />
        </>
    );
}

export default DndTreeItemMoreActions;
