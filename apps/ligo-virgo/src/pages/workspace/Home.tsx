import { services, TemplateFactory } from '@toeverything/datasource/db-service';
import { useUserAndSpaces } from '@toeverything/datasource/state';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function WorkspaceHome() {
    const navigate = useNavigate();
    const { workspaceId } = useParams();
    const { user } = useUserAndSpaces();

    useEffect(() => {
        const navigateToUserInitialPage = async () => {
            const [recentPages, userInitialPageId] = await Promise.all([
                services.api.userConfig.getRecentPages(workspaceId, user.id),
                services.api.userConfig.getUserInitialPage(
                    workspaceId,
                    user.id
                ),
            ]);
            // if recent pages if null, run initialize task
            if (recentPages.length === 0) {
                await services.api.editorBlock.copyTemplateToPage(
                    workspaceId,
                    userInitialPageId,
                    TemplateFactory.generatePageTemplateByGroupKeys({
                        name: '👋 Get Started with AFFiNE',
                        groupKeys: [
                            'getStartedGroup0',
                            'getStartedGroup1',
                            'getStartedGroup2',
                        ],
                    })
                );
            }
            if (userInitialPageId) {
                navigate(`/${workspaceId}/${userInitialPageId}`);
            }
        };
        navigateToUserInitialPage();
    }, [navigate, user.id, workspaceId]);

    return null;
}
