import { useState } from 'react';

type PageViewStatusType = 'editor' | 'board';

export const useLayoutHeader = () => {
    const [pageViewStatus, setPageViewStatus] =
        useState<PageViewStatusType>('editor');

    return {
        pageViewStatus,
        setPageViewStatus,
    };
};
