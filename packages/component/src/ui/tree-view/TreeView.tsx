import { useEffect, useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import { TreeNode, TreeNodeWithDnd } from './TreeNode';
import type { TreeViewProps } from './types';
import { flattenIds } from './utils';

export const TreeView = <RenderProps,>({
  data,
  enableKeyboardSelection,
  onSelect,
  enableDnd = true,
  ...otherProps
}: TreeViewProps<RenderProps>) => {
  const [selectedId, setSelectedId] = useState<string>();

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
  }, [data, selectedId]);

  if (enableDnd) {
    return (
      <DndProvider backend={HTML5Backend}>
        {data.map((node, index) => (
          <TreeNodeWithDnd
            key={node.id}
            index={index}
            node={node}
            selectedId={selectedId}
            enableDnd={enableDnd}
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
          node={node}
          selectedId={selectedId}
          enableDnd={enableDnd}
          {...otherProps}
        />
      ))}
    </>
  );
};

export default TreeView;
