import { services, TemplateFactory } from '@toeverything/datasource/db-service';
import React, { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
    BaseButton,
    ListButton,
    MuiPopover as Popover,
    styled,
} from '@toeverything/components/ui';
import { useFlag } from '@toeverything/datasource/feature-flags';
import { useUserAndSpaces } from '@toeverything/datasource/state';
const NewFromTemplatePortalContainer = styled('div')({
    width: '320p',
    padding: '15px',
    '.textDescription': {
        height: '22px',
        lineHeight: '22px',
        marginLeft: '30px',
        fontSize: '14px',
        color: '#ccc',
        p: {
            margin: 0,
        },
    },
    '.switchDescription': {
        color: '#ccc',
        fontSize: '14px',
        paddingLeft: '30px',
    },
});

const BtnPageSettingContainer = styled('div')({
    width: '24px',
    height: '24px',
});

const MESSAGES = {
    COPY_LINK: ' Copy Link',
    INVITE: 'Add people,emails, or groups',
    COPY_LINK_SUCCESS: 'Copyed link to clipboard',
};

interface NewFromTemplatePortalProps {
    workspaceId: string;
    pageId: string;
}
function NewFromTemplatePortal(props: NewFromTemplatePortalProps) {
    const [alertOpen, setAlertOpen] = useState(false);
    const [anchorEl, setAnchorEl] = React.useState<HTMLDivElement | null>(null);

    const params = useParams();
    const navigate = useNavigate();
    const { user } = useUserAndSpaces();

    const workspaceId = props.workspaceId;
    const pageId = props.pageId;
    const handleAlertClose = () => {
        setAlertOpen(false);
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

        handleClose();
    };
    const handleClose = () => {
        setAnchorEl(null);
    };
    const open = Boolean(anchorEl);
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        setAnchorEl(event.currentTarget);
    };
    const newFromTemplateRef = useRef();
    const templateList = useFlag(
        'JSONTemplateList',
        TemplateFactory.defaultTemplateList
    );
    return (
        <>
            <div ref={newFromTemplateRef} onClick={handleClick}>
                <ListButton content="New From Template" onClick={() => {}} />
            </div>

            <Popover
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
            >
                <NewFromTemplatePortalContainer>
                    <>
                        {templateList.map((template, index) => {
                            return (
                                <div
                                    key={index}
                                    onClick={() => {
                                        handleNewFromTemplate(template);
                                    }}
                                >
                                    <BaseButton>{template.name}</BaseButton>
                                </div>
                            );
                        })}
                    </>
                </NewFromTemplatePortalContainer>
            </Popover>
        </>
    );
}

export { NewFromTemplatePortal };
