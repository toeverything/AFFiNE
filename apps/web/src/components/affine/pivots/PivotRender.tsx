import { ArrowDownSmallIcon, EdgelessIcon, PageIcon } from '@blocksuite/icons';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';

import { workspacePreferredModeAtom } from '../../../atoms';
import { OperationButton } from './OperationButton';
import { StyledCollapsedButton, StyledPivot } from './styles';
import type { TreeNode } from './types';

export const PivotRender: TreeNode['render'] = (
  node,
  { isOver, onAdd, onDelete, collapsed, setCollapsed },
  renderProps
) => {
  const { onClick, showOperationButton = false, pageMeta } = renderProps || {};
  const record = useAtomValue(workspacePreferredModeAtom);

  const router = useRouter();
  const active = router.query.pageId === node.id;

  return (
    <StyledPivot
      onClick={e => {
        onClick?.(e, node);
      }}
      isOver={isOver}
      active={active}
    >
      <StyledCollapsedButton
        collapse={collapsed}
        show={!!node.children?.length}
        onClick={e => {
          e.stopPropagation();
          setCollapsed(!collapsed);
        }}
      >
        <ArrowDownSmallIcon />
      </StyledCollapsedButton>
      {record[node.id] === 'edgeless' ? <EdgelessIcon /> : <PageIcon />}
      <span>{pageMeta?.title || 'Untitled'}</span>
      {showOperationButton && (
        <OperationButton onAdd={onAdd} onDelete={onDelete} />
      )}
    </StyledPivot>
  );
};
