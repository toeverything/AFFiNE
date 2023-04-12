import { IconButton, TreeView } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  ArrowRightSmallIcon,
  CollapseIcon,
  ExpandIcon,
  MoreHorizontalIcon,
} from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useRouter } from 'next/router';
import type { MouseEvent } from 'react';
import { Fragment, useCallback, useMemo, useState } from 'react';

import { usePageMeta } from '../../../../hooks/use-page-meta';
import type { PinboardNode } from '../../../../hooks/use-pinboard-data';
import { usePinboardData } from '../../../../hooks/use-pinboard-data';
import { useRouterHelper } from '../../../../hooks/use-router-helper';
import type { BlockSuiteWorkspace } from '../../../../shared';
import { PinboardRender } from '../../../affine/pinboard';
import {
  StyledNavigationPathContainer,
  StyledNavPathExtendContainer,
  StyledNavPathLink,
} from './styles';
import { calcHowManyPathShouldBeShown, findPath } from './utils';

export const NavigationPath = ({
  blockSuiteWorkspace,
  pageId: propsPageId,
  onJumpToPage,
}: {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId?: string;
  onJumpToPage?: (pageId: string) => void;
}) => {
  const metas = usePageMeta(blockSuiteWorkspace);
  const router = useRouter();

  const [openExtend, setOpenExtend] = useState(false);
  const pageId = propsPageId ?? router.query.pageId;
  const { jumpToPage } = useRouterHelper(router);
  const pathData = useMemo(() => {
    const meta = metas.find(m => m.id === pageId);
    const path = meta ? findPath(metas, meta) : [];
    const actualPath = calcHowManyPathShouldBeShown(path);
    return {
      hasEllipsis: path.length !== actualPath.length,
      path: actualPath,
    };
  }, [metas, pageId]);

  if (pathData.path.length === 0) {
    return null;
  }
  return (
    <>
      <StyledNavigationPathContainer>
        {pathData.path.map((meta, index) => {
          const isLast = index === pathData.path.length - 1;
          const showEllipsis = pathData.hasEllipsis && index === 1;
          return (
            <Fragment key={meta.id}>
              {showEllipsis && (
                <>
                  <MoreHorizontalIcon />
                  <ArrowRightSmallIcon className="path-arrow" />
                </>
              )}
              <StyledNavPathLink
                active={isLast}
                onClick={() => {
                  jumpToPage(blockSuiteWorkspace.id, meta.id);
                  onJumpToPage?.(meta.id);
                }}
              >
                {meta.title}
              </StyledNavPathLink>
              {!isLast && <ArrowRightSmallIcon className="path-arrow" />}
            </Fragment>
          );
        })}
        <IconButton
          size="middle"
          className="collapse-btn"
          onClick={() => {
            setOpenExtend(!openExtend);
          }}
        >
          {openExtend ? <CollapseIcon /> : <ExpandIcon />}
        </IconButton>
      </StyledNavigationPathContainer>
      <NavigationPathExtendPanel
        open={openExtend}
        blockSuiteWorkspace={blockSuiteWorkspace}
        metas={metas}
        onClose={() => {
          setOpenExtend(false);
        }}
        onJumpToPage={onJumpToPage}
      />
    </>
  );
};

const NavigationPathExtendPanel = ({
  open,
  metas,
  blockSuiteWorkspace,
  onClose,
  onJumpToPage,
}: {
  open: boolean;
  metas: PageMeta[];
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onClose: () => void;
  onJumpToPage?: (pageId: string) => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { jumpToPage } = useRouterHelper(router);

  const handlePinboardClick = useCallback(
    (e: MouseEvent<HTMLDivElement>, node: PinboardNode) => {
      jumpToPage(blockSuiteWorkspace.id, node.id);
      onJumpToPage?.(node.id);
    },
    [blockSuiteWorkspace.id, jumpToPage, onJumpToPage]
  );

  const { data } = usePinboardData({
    metas,
    pinboardRender: PinboardRender,
    blockSuiteWorkspace: blockSuiteWorkspace,
    onClick: handlePinboardClick,
    asPath: true,
  });

  return (
    <StyledNavPathExtendContainer show={open}>
      <div className="title">
        <span>{t('Navigation Path')}</span>
        <IconButton size="middle" className="collapse-btn" onClick={onClose}>
          <CollapseIcon />
        </IconButton>
      </div>
      <div className="tree-container">
        <TreeView data={data} indent={10} disableCollapse={true} />
      </div>
    </StyledNavPathExtendContainer>
  );
};
