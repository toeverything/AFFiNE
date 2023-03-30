import { ArrowDownSmallIcon, EdgelessIcon, PageIcon } from '@blocksuite/icons';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { workspacePreferredModeAtom } from '../../../atoms';
import { OperationButton } from './OperationButton';
import { StyledCollapsedButton, StyledPivot } from './styles';
import type { TreeNode } from './types';

export const PivotRender: TreeNode['render'] = (
  node,
  { isOver, onAdd, onDelete, collapsed, setCollapsed, isSelected },
  renderProps
) => {
  const {
    onClick,
    showOperationButton = false,
    currentMeta,
    metas = [],
    blockSuiteWorkspace,
  } = renderProps!;
  const record = useAtomValue(workspacePreferredModeAtom);
  const router = useRouter();

  const [isHover, setIsHover] = useState(false);

  const active = router.query.pageId === node.id;

  return (
    <StyledPivot
      onClick={e => {
        onClick?.(e, node);
      }}
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
      isOver={isOver || isSelected}
      active={active}
    >
      <StyledCollapsedButton
        collapse={collapsed}
        show={!!node.children?.length}
        onClick={e => {
          e.stopPropagation();
          setCollapsed(node.id, !collapsed);
        }}
      >
        <ArrowDownSmallIcon />
      </StyledCollapsedButton>
      {record[node.id] === 'edgeless' ? <EdgelessIcon /> : <PageIcon />}
      <span>{currentMeta?.title || 'Untitled'}</span>
      {showOperationButton && (
        <OperationButton
          onAdd={onAdd}
          onDelete={onDelete}
          metas={metas}
          currentMeta={currentMeta!}
          blockSuiteWorkspace={blockSuiteWorkspace!}
          isHover={isHover}
          onMenuClose={() => setIsHover(false)}
        />
      )}
    </StyledPivot>
  );
};
