import { Input } from '@affine/component';
import {
  ArrowDownSmallIcon,
  EdgelessIcon,
  LevelIcon,
  PageIcon,
  PivotsIcon,
} from '@blocksuite/icons';
import { usePageMetaHelper } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue } from 'jotai';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import type { PinboardNode } from '../../../../hooks/use-pinboard-data';
import { StyledCollapsedButton, StyledPinboard } from '../styles';
import { AddButton } from './AddButton';
import EmptyItem from './EmptyItem';
import { OperationButton } from './OperationButton';

const getIcon = (type: 'root' | 'edgeless' | 'page') => {
  switch (type) {
    case 'root':
      return <PivotsIcon className="mode-icon" />;
    case 'edgeless':
      return <EdgelessIcon className="mode-icon" />;
    default:
      return <PageIcon className="mode-icon" />;
  }
};

export const PinboardRender: PinboardNode['render'] = (
  node,
  {
    isOver,
    onAdd,
    onDelete,
    collapsed,
    setCollapsed,
    isSelected,
    disableCollapse,
  },
  renderProps
) => {
  const {
    onClick,
    showOperationButton = false,
    currentMeta,
    metas = [],
    blockSuiteWorkspace,
    asPath,
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
        disableCollapse={!!disableCollapse}
      >
        {!disableCollapse && (
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
        )}
        {asPath && !isRoot ? <LevelIcon className="path-icon" /> : null}
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
        {showOperationButton && <AddButton onAdd={onAdd} visible={isHover} />}

        {showOperationButton && (
          <OperationButton
            isRoot={isRoot}
            onAdd={onAdd}
            onDelete={onDelete}
            metas={metas}
            currentMeta={currentMeta!}
            blockSuiteWorkspace={blockSuiteWorkspace!}
            visible={isHover}
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
