import { useCallback, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { atom, useAtom } from 'jotai';
// import { Virgo } from '@toeverything/components/editor-core';

// type EditorsMap = Record<string, Virgo>;
type EditorsMap = Record<string, any>;

const _currentEditors = atom<EditorsMap>({} as EditorsMap);

/** hook for using editors outside page */
export const useCurrentEditors = () => {
    const { workspace_id: workspaceId, page_id: pageId } = useParams();
    const { pathname } = useLocation();
    const [currentEditors, setCurrentEditors] = useAtom(_currentEditors);

    useEffect(() => {
        if (!workspaceId || !pageId) return;
        if (pathname.split('/').length >= 3) {
            setCurrentEditors({});
        }
    }, [pageId, pathname, setCurrentEditors, workspaceId]);

    return {
        currentEditors,
        setCurrentEditors,
    };
};

// when first time transfer doc to board, need init the editor shape size to page size.
const _pageClientWidth = atom<number>(1020);
export const usePageClientWidth = () => {
    const [pageClientWidth, setPageClientWidth] = useAtom(_pageClientWidth);
    return {
        pageClientWidth,
        setPageClientWidth,
    };
};
