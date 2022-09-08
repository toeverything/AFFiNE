import { services, TemplateFactory } from '@toeverything/datasource/db-service';
import { useUserAndSpaces } from '@toeverything/datasource/state';
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function WorkspaceHome() {
    const navigate = useNavigate();
    const { workspace_id } = useParams();
    const { user } = useUserAndSpaces();

    useEffect(() => {
        const navigateToUserInitialPage = async () => {
            const [recentPages, userInitialPageId] = await Promise.all([
                services.api.userConfig.getRecentPages(workspace_id, user.id),
                services.api.userConfig.getUserInitialPage(
                    workspace_id,
                    user.id
                ),
            ]);
            // if recent pages if null, run initialize task
            if (recentPages.length === 0) {
                await services.api.editorBlock.copyTemplateToPage(
                    workspace_id,
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
                navigate(`/${workspace_id}/${userInitialPageId}`);
            }
        };
        navigateToUserInitialPage();
    }, [navigate, user.id, workspace_id]);

    return null;
}
