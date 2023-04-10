import { Input } from '@affine/component';
import {
  ArrowDownSmallIcon,
  EdgelessIcon,
  PageIcon,
  PivotsIcon,
} from '@blocksuite/icons';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import { usePageMetaHelper } from '../../../../hooks/use-page-meta';
import type { PinboardNode } from '../../../../hooks/use-pinboard-data';
import { StyledCollapsedButton, StyledPinboard } from '../styles';
import EmptyItem from './EmptyItem';
import { OperationButton } from './OperationButton';

const getIcon = (type: 'root' | 'edgeless' | 'page') => {
  switch (type) {
    case 'root':
      return <PivotsIcon />;
    case 'edgeless':
      return <EdgelessIcon />;
    default:
      return <PageIcon />;
  }
};

export const PinboardRender: PinboardNode['render'] = (
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
  const isRoot = !!currentMeta.isRootPinboard;
  return (
    <>
      <StyledPinboard
        data-testid={`pinboard-${node.id}`}
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
        {getIcon(isRoot ? 'root' : record[node.id])}

        {showRename ? (
          <Input
            data-testid={`pinboard-input-${node.id}`}
            value={currentMeta.title || ''}
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
          <span>{isRoot ? 'Pinboard' : currentMeta.title || 'Untitled'}</span>
        )}

        {showOperationButton && (
          <OperationButton
            isRoot={isRoot}
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
      </StyledPinboard>

      {useMemo(
        () =>
          isRoot &&
          !metas.find(m => (currentMeta.subpageIds ?? []).includes(m.id)),
        [currentMeta.subpageIds, isRoot, metas]
      ) && <EmptyItem />}
    </>
  );
};
export default PinboardRender;
