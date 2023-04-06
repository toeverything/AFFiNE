import { Input } from '@affine/component';
import { ArrowDownSmallIcon, EdgelessIcon, PageIcon } from '@blocksuite/icons';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import { usePageMetaHelper } from '../../../../hooks/use-page-meta';
import { StyledCollapsedButton, StyledPivot } from '../styles';
import type { TreeNode } from '../types';
import { OperationButton } from './OperationButton';

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
  const { setPageTitle } = usePageMetaHelper(blockSuiteWorkspace);

  const router = useRouter();

  const [isHover, setIsHover] = useState(false);
  const [showRename, setShowRename] = useState(false);

  const active = router.query.pageId === node.id;

  return (
    <StyledPivot
      data-testid={`pivot-${node.id}`}
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
      {showRename ? (
        <Input
          data-testid={`pivot-input-${node.id}`}
          value={currentMeta?.title ?? ''}
          placeholder="Untitled"
          onClick={e => e.stopPropagation()}
          height={32}
          onBlur={() => {
            setShowRename(false);
          }}
          onChange={value => {
            // FIXME: setPageTitle would make input blur, and can't input the Chinese character
            setPageTitle(node.id, value);
          }}
        />
      ) : (
        <span>{currentMeta?.title || 'Untitled'}</span>
      )}

      {showOperationButton && (
        <OperationButton
          onAdd={onAdd}
          onDelete={onDelete}
          metas={metas}
          currentMeta={currentMeta!}
          blockSuiteWorkspace={blockSuiteWorkspace!}
          isHover={isHover}
          onMenuClose={() => setIsHover(false)}
          onRename={() => {
            setShowRename(true);
            setIsHover(false);
          }}
        />
      )}
    </StyledPivot>
  );
};
