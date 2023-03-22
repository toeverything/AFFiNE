import { IconButton } from '@affine/component';
import {
  ArrowDownSmallIcon,
  DeleteTemporarilyIcon,
  PlusIcon,
} from '@blocksuite/icons';
import { useRouter } from 'next/router';

import { StyledCollapsedButton, StyledPivotItem } from './styles';
import type { TreeNode } from './types';

export const TreeNodeRender: TreeNode['render'] = (
  node,
  { onAdd, onDelete, collapsed, setCollapsed },
  extendProps
) => {
  const { openPage } = extendProps as { openPage: (pageId: string) => void };

  const router = useRouter();
  const active = router.query.pageId === node.id;
  return (
    <StyledPivotItem
      onClick={() => {
        if (active) {
          return;
        }
        openPage(node.id);
      }}
      active={active}
    >
      <StyledCollapsedButton
        show={!!node.children?.length}
        onClick={e => {
          e.stopPropagation();
          setCollapsed(!collapsed);
        }}
        size="small"
      >
        <ArrowDownSmallIcon
          style={{
            transform: `rotate(${collapsed ? '0' : '180'}deg)`,
          }}
        />
      </StyledCollapsedButton>
      <span>{node.title || 'Untitled'}</span>
      <IconButton
        onClick={e => {
          e.stopPropagation();
          onAdd();
        }}
        size="small"
        className="pivot-item-button"
      >
        <PlusIcon />
      </IconButton>
      <IconButton
        onClick={e => {
          e.stopPropagation();

          onDelete();
        }}
        size="small"
        className="pivot-item-button"
      >
        <DeleteTemporarilyIcon />
      </IconButton>
    </StyledPivotItem>
  );
};
