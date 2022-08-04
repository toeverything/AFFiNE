/* eslint-disable filename-rules/match */
import {
    useEffect,
    useRef,
    type UIEvent,
    useState,
    useLayoutEffect,
} from 'react';
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
    usePageClientWidth,
} from '@toeverything/datasource/state';
import { services } from '@toeverything/datasource/db-service';

import { WorkspaceName } from './workspace-name';
import { CollapsiblePageTree } from './collapsible-page-tree';
import { useFlag } from '@toeverything/datasource/feature-flags';
import { type BlockEditor } from '@toeverything/components/editor-core';
import { Tabs } from './components/tabs';
type PageProps = {
    workspace: string;
};

export function Page(props: PageProps) {
    const { page_id } = useParams();
    const { showSpaceSidebar, fixedDisplay, setSpaceSidebarVisible } =
        useShowSpaceSidebar();
    const { user } = useUserAndSpaces();
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

            // await services.api.userConfig.addRecentPage(
            //     props.workspace,
            //     user.id,
            //     page_id
            // );
            await services.api.editorBlock.clearUndoRedo(props.workspace);
        };
        updateRecentPages();
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
                        transition: '0.8s',
                    }}
                    onMouseEnter={() => setSpaceSidebarVisible(true)}
                    onMouseLeave={() => setSpaceSidebarVisible(false)}
                >
                    <WorkspaceName />

                    <Tabs />

                    <WorkspaceSidebarContent>
                        <div>
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
                                    <Activities />
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
            <EditorContainer workspace={props.workspace} pageId={page_id} />
        </LigoApp>
    );
}

const EditorContainer = ({
    pageId,
    workspace,
}: {
    pageId: string;
    workspace: string;
}) => {
    const [lockScroll, setLockScroll] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>();
    const editorRef = useRef<BlockEditor>();
    const onScroll = (event: UIEvent) => {
        editorRef.current.getHooks().onRootNodeScroll(event);
        editorRef.current.scrollManager.emitScrollEvent(event);
    };

    useEffect(() => {
        editorRef.current.scrollManager.scrollContainer =
            scrollContainerRef.current;

        editorRef.current.scrollManager.scrollController = {
            lockScroll: () => setLockScroll(true),
            unLockScroll: () => setLockScroll(false),
        };
    }, []);

    const { setPageClientWidth } = usePageClientWidth();
    useEffect(() => {
        if (scrollContainerRef.current) {
            const obv = new ResizeObserver(e => {
                setPageClientWidth(e[0].contentRect.width);
            });
            obv.observe(scrollContainerRef.current);
            return () => obv.disconnect();
        }
    }, [setPageClientWidth]);

    return (
        <StyledEditorContainer
            lockScroll={lockScroll}
            ref={scrollContainerRef}
            onScroll={onScroll}
        >
            {pageId ? (
                <AffineEditor
                    workspace={workspace}
                    rootBlockId={pageId}
                    ref={editorRef}
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
        </StyledEditorContainer>
    );
};

const StyledEditorContainer = styled('div')<{ lockScroll: boolean }>(
    ({ lockScroll }) => {
        return {
            width: '100%',
            overflowY: lockScroll ? 'hidden' : 'auto',
            flex: 'auto',
        };
    }
);

const LigoApp = styled('div')({
    width: '100vw',
    display: 'flex',
    flex: '1 1 0%',
    backgroundColor: 'white',
});

const LigoLeftContainer = styled('div')({
    flex: '0 0 auto',
    position: 'relative',
});

const WorkspaceSidebar = styled('div')(({ hidden }) => ({
    position: 'absolute',
    bottom: '48px',
    top: '12px',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: 300,
    minWidth: 300,
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
    marginTop: '18px',
});
