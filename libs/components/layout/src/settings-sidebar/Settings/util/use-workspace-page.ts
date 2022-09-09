import { useParams } from 'react-router-dom';

interface UseWorkspaceAndPageIdReturn {
    workspaceId?: string;
    pageId?: string;
}

export const useWorkspaceAndPageId = (): UseWorkspaceAndPageIdReturn => {
    const params = useParams();
    const workspaceId = params['workspaceId'];
    const pageId = params['*'].split('/')[0];
    return {
        workspaceId,
        pageId,
    };
};
