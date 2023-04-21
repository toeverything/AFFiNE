import { useState } from 'react';

import type { TreeNodeProps } from '../types';
export const useCollapsed = <RenderProps>({
  initialCollapsedIds = [],
  disableCollapse = false,
}: {
  disableCollapse?: boolean;
  initialCollapsedIds?: string[];
}) => {
  // TODO: should record collapsedIds in localStorage
  const [collapsedIds, setCollapsedIds] =
    useState<string[]>(initialCollapsedIds);

  const setCollapsed: TreeNodeProps['setCollapsed'] = (id, collapsed) => {
    if (disableCollapse) {
      return;
    }
    if (collapsed) {
      setCollapsedIds(ids => [...ids, id]);
    } else {
      setCollapsedIds(ids => ids.filter(i => i !== id));
    }
  };

  return {
    collapsedIds,
    setCollapsed,
  };
};

export default useCollapsed;
