import { useEffect, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import { TreeNode, TreeNodeWithDnd } from './TreeNode';
import type { TreeNodeProps, TreeViewProps } from './types';
import { flattenIds } from './utils';

export const TreeView = <RenderProps,>({
  data,
  enableKeyboardSelection,
  onSelect,
  enableDnd = true,
  initialCollapsedIds = [],
  disableCollapse,
  ...otherProps
}: TreeViewProps<RenderProps>) => {
  const [selectedId, setSelectedId] = useState<string>();
  // TODO: should record collapsedIds in localStorage
  const [collapsedIds, setCollapsedIds] =
    useState<string[]>(initialCollapsedIds);

  useEffect(() => {
    if (!enableKeyboardSelection) {
      return;
    }

    const flattenedIds = flattenIds<RenderProps>(data);

    const handleDirectionKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
        return;
      }
      if (selectedId === undefined) {
        setSelectedId(flattenedIds[0]);
        return;
      }
      let selectedIndex = flattenedIds.indexOf(selectedId);
      if (e.key === 'ArrowDown') {
        selectedIndex < flattenedIds.length - 1 && selectedIndex++;
      }
      if (e.key === 'ArrowUp') {
        selectedIndex > 0 && selectedIndex--;
      }

      setSelectedId(flattenedIds[selectedIndex]);
    };

    const handleEnterKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') {
        return;
      }
      selectedId && onSelect?.(selectedId);
    };

    document.addEventListener('keydown', handleDirectionKeyDown);
    document.addEventListener('keydown', handleEnterKeyDown);

    return () => {
      document.removeEventListener('keydown', handleDirectionKeyDown);
      document.removeEventListener('keydown', handleEnterKeyDown);
    };
  }, [data, enableKeyboardSelection, onSelect, selectedId]);

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

  if (enableDnd) {
    return (
      <DndProvider backend={HTML5Backend}>
        {data.map((node, index) => (
          <TreeNodeWithDnd
            key={node.id}
            index={index}
            collapsedIds={collapsedIds}
            setCollapsed={setCollapsed}
            node={node}
            selectedId={selectedId}
            enableDnd={enableDnd}
            disableCollapse={disableCollapse}
            {...otherProps}
          />
        ))}
      </DndProvider>
    );
  }

  return (
    <>
      {data.map((node, index) => (
        <TreeNode
          key={node.id}
          index={index}
          collapsedIds={collapsedIds}
          setCollapsed={setCollapsed}
          node={node}
          selectedId={selectedId}
          enableDnd={enableDnd}
          disableCollapse={disableCollapse}
          {...otherProps}
        />
      ))}
    </>
  );
};

export default TreeView;
