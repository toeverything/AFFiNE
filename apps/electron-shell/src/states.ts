import { useEffect, useState } from 'react';

export const useTabIds = () => {
  const [tabIds, setTabIds] = useState<string[]>([]);

  useEffect(() => {
    window.apis?.ui.getTabs().then(ids => {
      setTabIds(ids);
    });

    return window.events?.ui.onTabsUpdated(tabs => {
      setTabIds(tabs);
    });
  }, []);

  return tabIds;
};

export const useActiveTabId = () => {
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  useEffect(() => {
    window.apis?.ui.getActiveTab().then(id => {
      setActiveTabId(id);
    });

    return window.events?.ui.onActiveTabChanged(id => {
      setActiveTabId(id);
    });
  });

  return activeTabId;
};
