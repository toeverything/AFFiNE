import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import { TreeNode } from './TreeNode';
import type { TreeViewProps } from './types';
export const TreeView = <N,>({ data, ...otherProps }: TreeViewProps<N>) => {
  return (
    <DndProvider backend={HTML5Backend}>
      {data.map(node => (
        <TreeNode key={node.id} node={node} {...otherProps} />
      ))}
    </DndProvider>
  );
};

export default TreeView;
