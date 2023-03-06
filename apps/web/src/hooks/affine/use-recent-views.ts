import { useAtom } from 'jotai';

import { workspaceRecentViewsAtom } from '../../atoms';

export const useRecentlyViewed = (workspaceId: string) => {
  const [recentlyViewed, setRecentlyViewed] = useAtom(workspaceRecentViewsAtom);

  const workspaceRecent = recentlyViewed[workspaceId] || [];
  const MAX_RECENT_ITEMS = 3;

  const addRecentlyViewed = ({ title, id }: { title: string; id: string }) => {
    const workspaceRecentCopy = [...workspaceRecent];

    const itemIndex = workspaceRecentCopy.findIndex(item => item.id === id);
    if (itemIndex !== -1) {
      workspaceRecentCopy.splice(itemIndex, 1);
    }

    workspaceRecentCopy.unshift({ title, id });
    if (workspaceRecentCopy.length > MAX_RECENT_ITEMS) {
      workspaceRecentCopy.pop();
    }

    setRecentlyViewed(prev => ({
      ...prev,
      [workspaceId]: workspaceRecentCopy,
    }));
  };

  return { recentlyViewed: workspaceRecent, addRecentlyViewed };
};
