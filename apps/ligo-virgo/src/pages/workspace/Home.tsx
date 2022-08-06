import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUserAndSpaces } from '@toeverything/datasource/state';
import { services, TemplateFactory } from '@toeverything/datasource/db-service';

export function WorkspaceHome() {
    const navigate = useNavigate();
    const { workspace_id } = useParams();
    const { user } = useUserAndSpaces();

    useEffect(() => {
        const navigate_to_user_initial_page = async () => {
            const [recent_pages, user_initial_page_id] = await Promise.all([
                services.api.userConfig.getRecentPages(workspace_id, user.id),
                services.api.userConfig.getUserInitialPage(
                    workspace_id,
                    user.id
                ),
            ]);
            if (recent_pages.length === 0) {
                await services.api.editorBlock.copyTemplateToPage(
                    workspace_id,
                    user_initial_page_id,
                    TemplateFactory.generatePageTemplateByGroupKeys({
                        name: null,
                        groupKeys: ['todolist'],
                    })
                );
            }
            navigate(`/${workspace_id}/${user_initial_page_id}`);
        };
        navigate_to_user_initial_page();
    }, [navigate, user.id, workspace_id]);

    return null;
}
