import { ArrowDownSmallIcon, PaletteIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useCallback, useState } from 'react';

import { type TreeNode } from '../resource';
import * as styles from '../theme-editor.css';

export const ThemeTreeNode = ({
  node,
  checked,
  setActive,
  isActive,
  isCustomized,
}: {
  node: TreeNode;
  checked?: TreeNode;
  setActive: (vs: TreeNode) => void;
  isActive?: (node: TreeNode) => boolean;
  isCustomized?: (node: TreeNode) => boolean;
}) => {
  const isLeaf = !node.children && node.variables;
  const [open, setOpen] = useState(false);

  const onClick = useCallback(() => {
    if (isLeaf || node.variables?.length) setActive(node);
    if (node.children) setOpen(prev => !prev);
  }, [isLeaf, node, setActive]);

  return (
    <Collapsible.Root open={open}>
      <div
        data-checked={node === checked}
        data-active={isActive?.(node)}
        data-customized={isCustomized?.(node)}
        className={styles.treeNode}
        onClick={onClick}
      >
        <div className={styles.treeNodeIconWrapper}>
          {isLeaf ? (
            <PaletteIcon width={16} height={16} />
          ) : (
            <ArrowDownSmallIcon
              data-open={open}
              className={styles.treeNodeCollapseIcon}
              width={20}
              height={20}
            />
          )}
        </div>
        <span>{node.label}</span>
      </div>
      <Collapsible.Content className={styles.treeNodeContent}>
        {node.children?.map(child => (
          <ThemeTreeNode
            key={child.id}
            node={child}
            checked={checked}
            isActive={isActive}
            setActive={setActive}
            isCustomized={isCustomized}
          />
        ))}
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
