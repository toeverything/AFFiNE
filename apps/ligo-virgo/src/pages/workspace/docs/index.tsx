/* eslint-disable filename-rules/match */
import { useEffect } from 'react';
import { useParams } from 'react-router';
import {
    MuiBox as Box,
    MuiCircularProgress as CircularProgress,
    MuiDivider as Divider,
    styled,
} from '@toeverything/components/ui';
import { AffineEditor } from '@toeverything/components/affine-editor';
import {
    CalendarHeatmap,
    PageTree,
    Activities,
} from '@toeverything/components/layout';
import { CollapsibleTitle } from '@toeverything/components/common';
import {
    useShowSpaceSidebar,
    useUserAndSpaces,
} from '@toeverything/datasource/state';
import { services } from '@toeverything/datasource/db-service';

import { WorkspaceName } from './workspace-name';
import { CollapsiblePageTree } from './collapsible-page-tree';
import TemplatesPortal from './templates-portal';
import { useFlag } from '@toeverything/datasource/feature-flags';

type PageProps = {
    workspace: string;
};

export function Page(props: PageProps) {
    const { page_id } = useParams();
    const { showSpaceSidebar, fixedDisplay, setSpaceSidebarVisible } =
        useShowSpaceSidebar();
    const { user } = useUserAndSpaces();
    const templatesPortalFlag = useFlag('BooleanTemplatesPortal', false);
    const dailyNotesFlag = useFlag('BooleanDailyNotes', false);

    useEffect(() => {
        if (!user?.id || !page_id) return;
        const updateRecentPages = async () => {
            // TODO: deal with it temporarily
            await services.api.editorBlock.getWorkspaceDbBlock(
                props.workspace,
                {
                    userId: user.id,
                }
            );

            await services.api.userConfig.addRecentPage(
                props.workspace,
                user.id,
                page_id
            );
            await services.api.editorBlock.clearUndoRedo(props.workspace);
        };
        update_recent_pages();
    }, [user, props.workspace, page_id]);

    return (
        <LigoApp>
            <LigoLeftContainer style={{ width: fixedDisplay ? '300px' : 0 }}>
                <WorkspaceSidebar
                    style={{
                        opacity: !showSpaceSidebar && !fixedDisplay ? 0 : 1,
                        transform:
                            !showSpaceSidebar && !fixedDisplay
                                ? 'translateX(-270px)'
                                : 'translateX(0px)',
                    }}
                    onMouseEnter={() => setSpaceSidebarVisible(true)}
                    onMouseLeave={() => setSpaceSidebarVisible(false)}
                >
                    <WorkspaceName />
                    <Divider light={true} sx={{ my: 1, margin: '6px 0px' }} />
                    <WorkspaceSidebarContent>
                        <div>
                            {templatesPortalFlag && <TemplatesPortal />}
                            {dailyNotesFlag && (
                                <div>
                                    <CollapsibleTitle title="Daily Notes">
                                        <CalendarHeatmap />
                                    </CollapsibleTitle>
                                </div>
                            )}
                            <div>
                                <CollapsibleTitle
                                    title="Activities"
                                    initialOpen={false}
                                >
                                    <Activities></Activities>
                                </CollapsibleTitle>
                            </div>
                            <div>
                                <CollapsiblePageTree title="Page Tree">
                                    {page_id ? <PageTree /> : null}
                                </CollapsiblePageTree>
                            </div>
                        </div>
                    </WorkspaceSidebarContent>
                </WorkspaceSidebar>
            </LigoLeftContainer>
            <LigoRightContainer>
                <LigoEditorOuterContainer>
                    {page_id ? (
                        <AffineEditor
                            workspace={props.workspace}
                            rootBlockId={page_id}
                        />
                    ) : (
                        <Box
                            sx={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                width: '100%',
                            }}
                        >
                            <CircularProgress />
                        </Box>
                    )}
                </LigoEditorOuterContainer>
            </LigoRightContainer>
        </LigoApp>
    );
}

const LigoApp = styled('div')({
    width: '100vw',
    position: 'relative',
    display: 'flex',
    flex: '1 1 0%',
    backgroundColor: 'white',
    margin: '10px 0',
});

const LigoRightContainer = styled('div')({
    position: 'relative',
    width: '100%',
    flex: 'auto',
});

const LigoEditorOuterContainer = styled('div')({
    position: 'absolute',
    height: '100%',
    width: '100%',
    overflowX: 'hidden',
    overflowY: 'hidden',
});

const LigoLeftContainer = styled('div')({
    flex: '0 0 auto',
});

const WorkspaceSidebar = styled('div')(({ hidden }) => ({
    position: 'absolute',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: 300,
    minWidth: 300,
    height: '100%',
    borderRadius: '0px 10px 10px 0px',
    boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
    backgroundColor: '#FFFFFF',
    transitionProperty: 'left',
    transitionDuration: '0.35s',
    transitionTimingFunction: 'ease',
    padding: '16px 12px',
}));

const WorkspaceSidebarContent = styled('div')({
    flex: 'auto',
    overflow: 'hidden auto',
});
