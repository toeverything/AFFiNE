import { services } from '@toeverything/datasource/db-service';

interface DuplicatePageProps {
    workspaceId: string;
    pageId: string;
}
export const duplicatePage = async ({
    workspaceId,
    pageId,
}: DuplicatePageProps) => {
    //create page
    const newPage = await services.api.editorBlock.create({
        workspace: workspaceId,
        type: 'page' as const,
    });
    //add page to tree
    await services.api.pageTree.addNextPageToWorkspace(
        workspaceId,
        pageId,
        newPage.id
    );
    //copy source page to new page
    await services.api.editorBlock.copyPage(workspaceId, pageId, newPage.id);

    return {
        workspaceId,
        pageId: newPage.id,
    };
};
