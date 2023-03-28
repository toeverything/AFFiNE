import { ArrowDownSmallIcon, EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';

import { workspacePreferredModeAtom } from '../../../../atoms';
import { StyledCollapseButton, StyledCollapseItem } from '../shared-styles';
import { OperationButton } from './OperationButton';
import type { TreeNode } from './types';

export const TreeNodeRender: TreeNode['render'] = (
  node,
  { isOver, onAdd, onDelete, collapsed, setCollapsed },
  extendProps
) => {
  const { openPage, pageMeta } = extendProps as {
    openPage: (pageId: string) => void;
    pageMeta: PageMeta;
  };
  const record = useAtomValue(workspacePreferredModeAtom);

  const router = useRouter();
  const active = router.query.pageId === node.id;

  return (
    <StyledCollapseItem
      onClick={() => {
        if (active) {
          return;
        }
        openPage(node.id);
      }}
      isOver={isOver}
      active={active}
    >
      <StyledCollapseButton
        collapse={collapsed}
        show={!!node.children?.length}
        onClick={e => {
          e.stopPropagation();
          setCollapsed(!collapsed);
        }}
      >
        <ArrowDownSmallIcon />
      </StyledCollapseButton>
      {record[pageMeta.id] === 'edgeless' ? <EdgelessIcon /> : <PageIcon />}
      <span>{node.title || 'Untitled'}</span>
      <OperationButton onAdd={onAdd} onDelete={onDelete} />
    </StyledCollapseItem>
  );
};
